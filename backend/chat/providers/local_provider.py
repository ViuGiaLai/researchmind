"""Local llama-server (GGUF) provider implementation.

Uses OpenAI-compatible API first, falls back to native /completion endpoint.
"""

import json

import httpx
from loguru import logger

from common.i18n import t as _t

from ..types import GenerationResult


class LocalProviderMixin:
    """Mixin with local llama-server methods.

    Requires Generator to have these attributes:
    - llama_server_url, local_model, local_max_tokens
    - http_client property
    - _local threading.local() for reasoning_mode, system_prompt_override
    - _get_local_system_prompt(), _get_system_prompt()
    - _apply_chat_template(), _extract_citations(), _verify_citations()
    """

    def _generate_local(self, prompt: str, system_prompt_override: str = None,
                        max_tokens: int | None = None) -> "GenerationResult":
        sp = system_prompt_override or self._get_system_prompt()
        messages = [{"role": "system", "content": sp}, {"role": "user", "content": prompt}]
        content = None
        model_used = f"local/{self.local_model}"
        is_fast = getattr(self._local, 'reasoning_mode', 'fast') == 'fast'
        local_ntokens = max_tokens or (self.local_max_tokens if not is_fast else 192)

        # Try OpenAI-compatible API first
        try:
            headers = {"Content-Type": "application/json"}
            payload = {
                "model": "local", "messages": messages,
                "temperature": 0.1 if is_fast else 0.3,
                "max_tokens": local_ntokens, "stream": False,
            }
            resp = self.http_client.post(f"{self.llama_server_url}/v1/chat/completions",
                                         headers=headers, json=payload, timeout=120.0)
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]
            msg = choice.get("message", {})
            raw_reasoning = msg.get("reasoning_content") or ""
            raw_content = msg.get("content") or ""
            if raw_reasoning:
                content = f"<think>\n{raw_reasoning.strip()}\n</think>\n\n{raw_content}"
            else:
                content = raw_content
        except Exception as e:
            logger.warning(f"OpenAI API on local gen failed ({e}), falling back to /completion...")

        # Fallback: native /completion endpoint
        if content is None:
            try:
                full_prompt = self._apply_chat_template(sp, prompt)
                completion_stop = ["<|im_end|>", "<|im_start|>"]
                response = self.http_client.post(
                    f"{self.llama_server_url}/completion",
                    json={
                        "prompt": full_prompt, "n_predict": local_ntokens,
                        "temperature": 0.1 if is_fast else 0.3,
                        "top_k": 40, "top_p": 0.1 if is_fast else 0.9,
                        "stop": completion_stop, "stream": False,
                    },
                    timeout=120.0,
                )
                response.raise_for_status()
                data = response.json()
                content = (data.get("content") or "").strip()
            except httpx.ConnectError:
                lang = getattr(getattr(self, '_local', None), 'lang', 'vi')
                logger.error("Cannot connect to llama-server.")
                return GenerationResult(
                    content=_t("provider.error.llama_connect", lang),
                    citations=[], model_used="local/error", finish_reason="error")
            except Exception as e:
                lang = getattr(getattr(self, '_local', None), 'lang', 'vi')
                logger.error(f"Local generation failed: {e}")
                return GenerationResult(content=_t("provider.error.llama", lang, error=str(e)),
                                        citations=[], model_used="local/error", finish_reason="error")

        citations = self._extract_citations(content)
        content = self._verify_citations(content, citations)
        return GenerationResult(content=content, citations=citations,
                                model_used=model_used, finish_reason="stop")

    def _sse_lines(self, response):
        """Read raw bytes from httpx stream and yield complete SSE lines."""
        buffer = b""
        for chunk in response.iter_bytes():
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                yield line.decode("utf-8", errors="replace").rstrip("\r")
        if buffer.strip():
            yield buffer.decode("utf-8", errors="replace").rstrip("\r")

    def _stream_local(self, prompt: str):
        """Stream response from llama-server (local GGUF model).

        Priority:
        1. OpenAI-compatible API (/v1/chat/completions) — gets reasoning_content field
        2. Fallback: native /completion — parse <think> tags from raw text
        """
        sp = self._get_local_system_prompt()
        messages = [{"role": "system", "content": sp}, {"role": "user", "content": prompt}]
        in_thinking = False
        is_fast = getattr(self._local, 'reasoning_mode', 'fast') == 'fast'

        # Try OpenAI-compatible API first
        try:
            headers = {"Content-Type": "application/json"}
            payload = {
                "model": "local", "messages": messages,
                "temperature": 0.1 if is_fast else 0.3,
                "max_tokens": self.local_max_tokens if not is_fast else 192,
                "stream": True,
            }
            any_content = False
            with self.http_client.stream("POST", f"{self.llama_server_url}/v1/chat/completions",
                                         headers=headers, json=payload,
                                         timeout=60.0 if is_fast else 120.0) as response:
                response.raise_for_status()
                for line in self._sse_lines(response):
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data["choices"][0]["delta"]
                        reasoning_chunk = delta.get("reasoning_content", "")
                        content_chunk = delta.get("content", "")
                        if reasoning_chunk and not is_fast:
                            if not in_thinking:
                                yield "<think>\n"
                                in_thinking = True
                            yield reasoning_chunk
                            any_content = True
                        if content_chunk:
                            if not is_fast and in_thinking:
                                yield "\n</think>\n"
                                in_thinking = False
                            yield content_chunk
                            any_content = True
                    except Exception:
                        continue
                if not is_fast and in_thinking:
                    yield "\n</think>\n"
                if any_content:
                    return
        except Exception as e:
            logger.warning(f"OpenAI API on local failed ({e}), falling back to /completion...")

        # Fallback: native /completion
        try:
            full_prompt = self._apply_chat_template(sp, prompt)
            completion_stop = ["<|im_end|>", "<|im_start|>"]
            with self.http_client.stream("POST", f"{self.llama_server_url}/completion",
                                         json={
                                             "prompt": full_prompt,
                                             "n_predict": self.local_max_tokens if not is_fast else 192,
                                             "temperature": 0.1 if is_fast else 0.3,
                                             "top_k": 40, "top_p": 0.1 if is_fast else 0.9,
                                             "stop": completion_stop, "stream": True,
                                         },
                                         timeout=60.0 if is_fast else 120.0) as response:
                response.raise_for_status()
                in_thinking = False
                is_fast = getattr(self._local, 'reasoning_mode', 'fast') == 'fast'
                for line in self._sse_lines(response):
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        chunk = data.get("content", "")
                        if not chunk:
                            continue
                        if is_fast:
                            yield chunk
                            continue
                        # Parse inline <think> tags from raw text
                        while chunk:
                            if not in_thinking:
                                idx = chunk.find("<think>")
                                if idx == -1:
                                    before, rest = chunk, ""
                                else:
                                    before = chunk[:idx]
                                    rest = chunk[idx + 7:]
                                if before:
                                    yield before
                                if idx != -1 and not in_thinking:
                                    yield "<think>\n"
                                    in_thinking = True
                                    chunk = rest
                                    continue
                                chunk = rest
                            else:
                                idx = chunk.find("</think>")
                                if idx == -1:
                                    yield chunk
                                    chunk = ""
                                else:
                                    before = chunk[:idx]
                                    rest = chunk[idx + 8:]
                                    if before:
                                        yield before
                                    yield "\n</think>\n"
                                    in_thinking = False
                                    chunk = rest
                    except Exception:
                        continue
                if not is_fast and in_thinking:
                    yield "\n</think>\n"
        except Exception as e:
            logger.error(f"Local stream failed: {e}")
