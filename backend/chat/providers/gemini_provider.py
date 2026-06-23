"""Google Gemini provider implementation (native API, non-OpenAI-compatible)."""

import json
from typing import Optional
import json
from loguru import logger
import httpx
from common.text_utils import redact_api_key
from ..types import GenerationResult


class GeminiProviderMixin:
    """Mixin with Gemini (non-stream + stream) methods.

    Requires Generator to have these attributes:
    - gemini_api_key, gemini_model
    - http_client property
    - _get_system_prompt(), _extract_citations(), _verify_citations()
    """

    def _generate_gemini(self, prompt: str, api_key: str, max_tokens: int = 1024,
                         is_free: bool = False,
                         system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "systemInstruction": {"parts": [{"text": sp}]},
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": max_tokens},
            }
            response = self.http_client.post(url, headers=headers, json=payload, timeout=60.0)
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return GenerationResult(content="⚠️ Gemini API không trả về nội dung.",
                                        citations=[], model_used="gemini/error", finish_reason="empty_response")
            content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            model_name = "gemini/free" if is_free else f"gemini/{self.gemini_model}"
            return GenerationResult(content=content, citations=citations,
                                    model_used=model_name, finish_reason="stop")
        except httpx.HTTPStatusError as e:
            logger.error(f"Gemini generation failed: {e}")
            detail = " API Key không hợp lệ." if (e.response.status_code == 400 and "API key" in e.response.text) else ""
            msg = redact_api_key(e.response.text[:300])
            return GenerationResult(content=f"⚠️ Lỗi Gemini (HTTP {e.response.status_code}): {msg}{detail}",
                                    citations=[], model_used="gemini/error", finish_reason="error")
        except Exception as e:
            logger.error(f"Gemini generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi Gemini: {redact_api_key(str(e))}",
                                    citations=[], model_used="gemini/error", finish_reason="error")

    def _stream_gemini(self, prompt: str, api_key: str, max_tokens: int = 1024,
                       is_free: bool = False):
        """Stream response from Google Gemini API (SSE native)."""
        try:
            url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                   f"{self.gemini_model}:streamGenerateContent?alt=sse&key={api_key}")
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "systemInstruction": {"parts": [{"text": self._get_system_prompt()}]},
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": max_tokens},
            }
            with self.http_client.stream("POST", url, headers=headers, json=payload, timeout=60.0) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        try:
                            data = json.loads(data_str)
                            candidates = data.get("candidates", [])
                            if candidates:
                                text_chunk = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                                if text_chunk:
                                    yield text_chunk
                        except Exception:
                            continue
        except Exception as e:
            logger.error(f"Gemini stream failed: {e}")
            yield f"\n⚠️ Gemini gặp sự cố ({redact_api_key(str(e))}). Đang chuyển sang Local model...\n"
            for chunk in self._stream_local(prompt):
                yield chunk
