"""OpenAI-compatible provider implementations.

Providers: GitHub, Groq, NVIDIA, FreeModel, OpenRouter, Cohere, Cloudflare, Cerebras, DeepSeek.
All use the same /chat/completions endpoint pattern.
"""

import json
from typing import Optional
from loguru import logger
import httpx
from common.text_utils import redact_api_key
from ..types import GenerationResult
from config.settings import settings


class OpenAIProviderMixin:
    """Mixin with OpenAI-compatible provider methods.

    Requires Generator to have these attributes set:
    - api keys: github_api_key, groq_api_key, nvidia_api_key, etc.
    - models: github_model, groq_model, nvidia_model, etc.
    - urls: github_url, nvidia_url, freemodel_url, etc.
    - http_client property
    - _get_system_prompt(), _get_local_system_prompt() methods
    - _extract_citations(), _verify_citations() methods
    """

    def _generate_github(self, prompt: str, api_key: str, model: str,
                         max_tokens: int = 1024,
                         system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                f"{self.github_url}/chat/completions", headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            choice = data.get("choices", [{}])[0]
            content = choice.get("message", {}).get("content") or ""
            finish_reason = choice.get("finish_reason", "stop")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"github/{model}", finish_reason=finish_reason)
        except httpx.HTTPStatusError as e:
            logger.error(f"GitHub Models generation failed: {e}")
            detail = ""
            if e.response.status_code == 401:
                detail = " GitHub Token không hợp lệ. Lấy PAT tại https://github.com/settings/tokens"
            elif e.response.status_code == 429:
                detail = " Đã hết hạn mức GitHub Models."
            return GenerationResult(content=f"⚠️ Lỗi GitHub Models (HTTP {e.response.status_code}): {e.response.text[:200]}{detail}",
                                    citations=[], model_used="github/error", finish_reason="error")
        except Exception as e:
            logger.error(f"GitHub Models generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi GitHub Models: {str(e)}",
                                    citations=[], model_used="github/error", finish_reason="error")

    def _generate_groq(self, prompt: str, api_key: str, model: str,
                       max_tokens: int = 1024,
                       system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            choice = data.get("choices", [{}])[0]
            content = choice.get("message", {}).get("content") or ""
            finish_reason = choice.get("finish_reason", "stop")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"groq/{model}", finish_reason=finish_reason)
        except httpx.HTTPStatusError as e:
            logger.error(f"Groq generation failed: {e}")
            detail = " API Key không hợp lệ." if e.response.status_code == 401 else ""
            return GenerationResult(content=f"⚠️ Lỗi Groq (HTTP {e.response.status_code}): {e.response.text[:200]}{detail}",
                                    citations=[], model_used="groq/error", finish_reason="error")
        except Exception as e:
            logger.error(f"Groq generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi Groq: {str(e)}",
                                    citations=[], model_used="groq/error", finish_reason="error")

    def _generate_nvidia(self, prompt: str, api_key: str, model: str,
                         max_tokens: int = 1024,
                         system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                f"{self.nvidia_url}/chat/completions", headers=headers, json=payload,
                timeout=getattr(settings, 'nvidia_timeout', 120.0),
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"nvidia/{model}", finish_reason="stop")
        except Exception as e:
            logger.error(f"NVIDIA generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi NVIDIA: {str(e)}",
                                    citations=[], model_used="nvidia/error", finish_reason="error")

    def _generate_freemodel(self, prompt: str, api_key: str, model: str,
                            max_tokens: int = 1024,
                            system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                f"{self.freemodel_url}/chat/completions", headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"freemodel/{model}", finish_reason="stop")
        except Exception as e:
            logger.error(f"FreeModel generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi FreeModel: {str(e)}",
                                    citations=[], model_used="freemodel/error", finish_reason="error")

    def _generate_openrouter(self, prompt: str, api_key: str, model: str,
                             max_tokens: int = 1024,
                             system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                f"{self.openrouter_url}/chat/completions", headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"openrouter/{model}", finish_reason="stop")
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenRouter generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi OpenRouter (HTTP {e.response.status_code}): {e.response.text[:200]}",
                                    citations=[], model_used="openrouter/error", finish_reason="error")
        except Exception as e:
            logger.error(f"OpenRouter generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi OpenRouter: {str(e)}",
                                    citations=[], model_used="openrouter/error", finish_reason="error")

    def _generate_cohere(self, prompt: str, api_key: str, model: str,
                         max_tokens: int = 1024,
                         system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                f"{self.cohere_url}/chat/completions", headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"cohere/{model}", finish_reason="stop")
        except httpx.HTTPStatusError as e:
            logger.error(f"Cohere generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi Cohere (HTTP {e.response.status_code}): {e.response.text[:200]}",
                                    citations=[], model_used="cohere/error", finish_reason="error")
        except Exception as e:
            logger.error(f"Cohere generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi Cohere: {str(e)}",
                                    citations=[], model_used="cohere/error", finish_reason="error")

    def _generate_cloudflare(self, prompt: str, api_key: str, model: str,
                             max_tokens: int = 1024,
                             system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                f"{self.cloudflare_url}/chat/completions", headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"cloudflare/{model}", finish_reason="stop")
        except httpx.HTTPStatusError as e:
            logger.error(f"Cloudflare Workers AI generation failed: {e}")
            detail = ""
            if e.response.status_code == 401:
                detail = " API Token không hợp lệ hoặc Account ID sai."
            elif e.response.status_code == 404:
                detail = " Model không tìm thấy. Kiểm tra model name và Account ID."
            return GenerationResult(content=f"⚠️ Lỗi Cloudflare (HTTP {e.response.status_code}): {e.response.text[:200]}{detail}",
                                    citations=[], model_used="cloudflare/error", finish_reason="error")
        except Exception as e:
            logger.error(f"Cloudflare Workers AI generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi Cloudflare: {str(e)}",
                                    citations=[], model_used="cloudflare/error", finish_reason="error")

    def _generate_cerebras(self, prompt: str, api_key: str, model: str,
                           max_tokens: int = 1024,
                           system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                f"{self.cerebras_url}/chat/completions", headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"cerebras/{model}", finish_reason="stop")
        except httpx.HTTPStatusError as e:
            logger.error(f"Cerebras generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi Cerebras (HTTP {e.response.status_code}): {e.response.text[:200]}",
                                    citations=[], model_used="cerebras/error", finish_reason="error")
        except Exception as e:
            logger.error(f"Cerebras generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi Cerebras: {str(e)}",
                                    citations=[], model_used="cerebras/error", finish_reason="error")

    def _generate_deepseek(self, prompt: str, api_key: str, max_tokens: int = 1024,
                           is_free: bool = False,
                           system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_local_system_prompt()
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": self.deepseek_model,
                "messages": [{"role": "system", "content": sp}, {"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
            }
            response = self.http_client.post(
                "https://api.deepseek.com/chat/completions", headers=headers, json=payload, timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            choice = data.get("choices", [{}])[0]
            content = choice.get("message", {}).get("content") or ""
            finish_reason = choice.get("finish_reason", "stop")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            model_name = "deepseek/free" if is_free else f"deepseek/{self.deepseek_model}"
            return GenerationResult(content=content, citations=citations,
                                    model_used=model_name, finish_reason=finish_reason)
        except Exception as e:
            logger.error(f"DeepSeek generation failed: {e}")
            return GenerationResult(content=f"⚠️ Lỗi DeepSeek: {str(e)}",
                                    citations=[], model_used="deepseek/error", finish_reason="error")

    def _stream_openai(self, prompt: str, api_key: str, model: str,
                       base_url: str, max_tokens: int = 1024):
        """Stream from any OpenAI-compatible API."""
        try:
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": True,
            }
            in_thinking = False
            is_fast = getattr(self._local, 'reasoning_mode', 'fast') == 'fast'
            with self.http_client.stream("POST", f"{base_url.rstrip('/')}/chat/completions",
                                         headers=headers, json=payload,
                                         timeout=getattr(settings, 'openai_stream_timeout', 60.0)) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"]
                            reasoning_chunk = delta.get("reasoning_content", "") or delta.get("reasoning", "")
                            content_chunk = delta.get("content", "")
                            if reasoning_chunk and not is_fast:
                                if not in_thinking:
                                    yield "<think>\n"
                                    in_thinking = True
                                yield reasoning_chunk
                            if content_chunk:
                                if not is_fast and in_thinking:
                                    yield "\n</think>\n"
                                    in_thinking = False
                                yield content_chunk
                        except Exception:
                            continue
                if not is_fast and in_thinking:
                    yield "\n</think>\n"
        except Exception as e:
            logger.error(f"OpenAI-compatible stream failed: {e}")

    def _stream_deepseek(self, prompt: str, api_key: str, max_tokens: int = 1024,
                         is_free: bool = False):
        """Stream response from DeepSeek API (has reasoning_content)."""
        try:
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": self.deepseek_model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3, "max_tokens": max_tokens, "stream": True,
            }
            in_thinking = False
            is_fast = getattr(self._local, 'reasoning_mode', 'fast') == 'fast'
            with self.http_client.stream("POST", "https://api.deepseek.com/chat/completions",
                                         headers=headers, json=payload, timeout=60.0) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"]
                            reasoning_chunk = delta.get("reasoning_content", "") or delta.get("reasoning", "")
                            content_chunk = delta.get("content", "")
                            if reasoning_chunk and not is_fast:
                                if not in_thinking:
                                    yield "<think>\n"
                                    in_thinking = True
                                yield reasoning_chunk
                            if content_chunk:
                                if not is_fast and in_thinking:
                                    yield "\n</think>\n"
                                    in_thinking = False
                                yield content_chunk
                        except Exception:
                            continue
                if not is_fast and in_thinking:
                    yield "\n</think>\n"
        except Exception as e:
            logger.error(f"DeepSeek stream failed: {e}")
            yield f"\n⚠️ DeepSeek gặp sự cố ({str(e)}). Đang chuyển sang Local model...\n"
            for chunk in self._stream_local(prompt):
                yield chunk
