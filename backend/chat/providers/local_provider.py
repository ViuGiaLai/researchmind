"""Local llama-server (GGUF) provider implementation.

Uses native /completion first for speed (ChatML prefill skips Qwen3 thinking),
falls back to OpenAI-compatible /v1/chat/completions.

Performance notes (CPU local is prefill + decode bound):
- Cap output tokens tightly by reasoning mode / task type
- Prefer /completion with empty <think> prefill so the model does not burn
  hundreds of tokens on internal reasoning
- Keep prompts short (caller fits via prompt_budget for provider=local)
- Enable cache_prompt so repeated system prefixes are cheaper
- Fail fast on dead servers; allow slow-but-alive generation via per-chunk read
"""

from __future__ import annotations

import json

import httpx
from loguru import logger

from common.i18n import t as _t

from ..types import GenerationResult


# Connect fails fast if the server is down.
# Read timeout is per-chunk (resets on every received byte).
LOCAL_TIMEOUT = httpx.Timeout(connect=5.0, read=90.0, write=10.0, pool=5.0)

# Absolute floors/ceilings for local GGUF generation.
MIN_LOCAL_NTOKENS = 64
MAX_LOCAL_NTOKENS = 1024

# Hard caps by reasoning mode — CPU decode is ~5–20 tok/s on small models.
LOCAL_MODE_CAPS: dict[str, int] = {
    "fast": 384,
    "deep": 512,
    "deep_plus": 1024,
    "deep+": 1024,
}

# Task ceilings. Chat/rag intentionally omit so reasoning-mode caps apply
# (fast=384, deep=640, deep_plus=896). Short tasks stay tight always.
LOCAL_TASK_CAPS: dict[str, int] = {
    "preview": 160,
    "summary": 320,
    "quality_check": 256,
    "review_outline": 320,
    "entity": 256,
    "review_section": 512,
    "verify": 512,
    "critique": 512,
    "gap": 512,
    "insight": 512,
    "review": 640,
    "debate": 640,
    "research": 640,
    "synthesis": 640,
}

# Reduce repetition loops that force generation to hit n_predict ceiling.
REPEAT_PENALTY = 1.12

# ChatML / Qwen stop sequences.
COMPLETION_STOP = ["<|im_end|>", "<|im_start|>", "<|endoftext|>"]


class LocalProviderMixin:
    """Mixin with local llama-server methods.

    Requires Generator to have these attributes:
    - llama_server_url, local_model, local_max_tokens
    - http_client property
    - _local threading.local() for reasoning_mode, system_prompt_override
    - _get_local_system_prompt(), _get_system_prompt()
    - _apply_chat_template(), _extract_citations(), _verify_citations()
    """

    def _resolve_ntokens(self, max_tokens: int | None) -> int:
        """Resolve a CPU-friendly n_predict / max_tokens for local generation."""
        reasoning_mode = str(getattr(self._local, "reasoning_mode", "fast") or "fast").lower()
        task_type = str(getattr(self._local, "task_type", "") or "").lower()

        configured = int(getattr(self, "local_max_tokens", 512) or 512)
        mode_cap = LOCAL_MODE_CAPS.get(reasoning_mode, LOCAL_MODE_CAPS["fast"])
        task_cap = LOCAL_TASK_CAPS.get(task_type, mode_cap)

        # deep_plus needs extra tokens for chain-of-thought + answer.
        # Override the user-configured ceiling so thinking doesn't eat the whole budget.
        if reasoning_mode == "deep_plus":
            configured = max(configured, mode_cap)

        requested = int(max_tokens) if max_tokens else configured
        # Never exceed the tightest of: request, configured default, mode, task, hard max.
        n = min(requested, configured, mode_cap, task_cap, MAX_LOCAL_NTOKENS)
        return max(MIN_LOCAL_NTOKENS, n)

    def _local_sampling(self, is_fast: bool) -> dict:
        """Sampling params tuned for short, non-looping local answers."""
        return {
            "temperature": 0.2 if is_fast else 0.35,
            "top_p": 0.9,
            "top_k": 30 if is_fast else 40,
            "repeat_penalty": REPEAT_PENALTY,
            # llama.cpp: reuse KV for identical prompt prefixes across calls
            "cache_prompt": True,
        }

    def _completion_payload(self, full_prompt: str, n_predict: int, is_fast: bool) -> dict:
        payload = {
            "prompt": full_prompt,
            "n_predict": n_predict,
            "stop": COMPLETION_STOP,
            "stream": True,
            **self._local_sampling(is_fast),
        }
        return payload

    def _chat_payload(self, messages: list[dict], n_predict: int, is_fast: bool, stream: bool) -> dict:
        # Qwen3 / llama-server: disable thinking when not in deep_plus.
        payload = {
            "model": "local",
            "messages": messages,
            "max_tokens": n_predict,
            "stream": stream,
            "stop": COMPLETION_STOP,
            "enable_thinking": False,
            "chat_template_kwargs": {"enable_thinking": False},
            **self._local_sampling(is_fast),
        }
        return payload

    def _build_local_chat_messages(self, system_prompt: str, user_prompt: str) -> list[dict]:
        """Build OpenAI-style messages, expanding multi-turn history when present."""
        history = getattr(self._local, "chat_history", None) or []
        current_user = user_prompt
        strip = getattr(self, "_strip_history_block", None)
        if history and callable(strip):
            current_user = strip(user_prompt)
        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for msg in history:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role")
            content = msg.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": current_user})
        return messages

    def _generate_local(
        self, prompt: str, system_prompt_override: str = None, max_tokens: int | None = None
    ) -> "GenerationResult":
        sp = system_prompt_override or self._get_local_system_prompt()
        model_used = f"local/{getattr(self, 'local_model', 'Qwen3-4B')}"
        reasoning_mode = getattr(self._local, "reasoning_mode", "fast")
        is_fast = reasoning_mode == "fast"
        is_deep_plus = reasoning_mode in ("deep+", "deep_plus")
        local_ntokens = self._resolve_ntokens(max_tokens)
        content = None

        # Prefer native /completion: ChatML prefill skips thinking cheaply.
        if not is_deep_plus:
            try:
                full_prompt = self._apply_chat_template(sp, prompt)
                payload = self._completion_payload(full_prompt, local_ntokens, is_fast)
                payload["stream"] = False
                response = self.http_client.post(
                    f"{self.llama_server_url}/completion",
                    json=payload,
                    timeout=LOCAL_TIMEOUT,
                )
                response.raise_for_status()
                data = response.json()
                content = (data.get("content") or "").strip()
                if content.startswith("</think>"):
                    content = content.replace("</think>", "", 1).lstrip("\r\n ")
            except (httpx.ConnectError, httpx.TimeoutException) as err:
                lang = getattr(getattr(self, "_local", None), "lang", "vi")
                logger.error(f"Local LLM connection/timeout error: {err}")
                return GenerationResult(
                    content=_t("provider.error.llama", lang, error=str(err)),
                    citations=[],
                    model_used="local/error",
                    finish_reason="error",
                )
            except Exception as e:
                logger.warning(f"Native /completion on local gen failed ({e}), trying chat API...")

        # Fallback / deep_plus: OpenAI-compatible chat API (stream+aggregate for timeout safety)
        if not content:
            messages = self._build_local_chat_messages(sp, prompt)
            if not is_deep_plus:
                # Prefill empty think block so Qwen3 does not start a long chain-of-thought.
                messages.append({"role": "assistant", "content": "<think>\n</think>\n"})
            try:
                headers = {"Content-Type": "application/json"}
                payload = self._chat_payload(messages, local_ntokens, is_fast, stream=True)
                if is_deep_plus:
                    payload.pop("enable_thinking", None)
                    payload["chat_template_kwargs"] = {"enable_thinking": True}
                reasoning_parts: list[str] = []
                content_parts: list[str] = []
                with self.http_client.stream(
                    "POST",
                    f"{self.llama_server_url}/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=LOCAL_TIMEOUT,
                ) as resp:
                    resp.raise_for_status()
                    for line in self._sse_lines(resp):
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"]
                            if delta.get("reasoning_content"):
                                reasoning_parts.append(delta["reasoning_content"])
                            if delta.get("content"):
                                content_parts.append(delta["content"])
                        except Exception:
                            continue
                raw_reasoning = "".join(reasoning_parts)
                raw_content = "".join(content_parts)
                if is_deep_plus and raw_reasoning:
                    content = f"<think>\n{raw_reasoning.strip()}\n</think>\n\n{raw_content}"
                else:
                    content = raw_content
            except (httpx.ConnectError, httpx.TimeoutException) as err:
                lang = getattr(getattr(self, "_local", None), "lang", "vi")
                logger.error(f"Local LLM connection/timeout error: {err}")
                return GenerationResult(
                    content=_t("provider.error.llama", lang, error=str(err)),
                    citations=[],
                    model_used="local/error",
                    finish_reason="error",
                )
            except Exception as e:
                lang = getattr(getattr(self, "_local", None), "lang", "vi")
                logger.error(f"Local generation failed: {e}")
                return GenerationResult(
                    content=_t("provider.error.llama", lang, error=str(e)),
                    citations=[],
                    model_used="local/error",
                    finish_reason="error",
                )

        if not content:
            lang = getattr(getattr(self, "_local", None), "lang", "vi")
            return GenerationResult(
                content=_t("provider.error.llama", lang, error="empty response"),
                citations=[],
                model_used="local/error",
                finish_reason="error",
            )

        citations = self._extract_citations(content)
        content = self._verify_citations(content, citations)
        return GenerationResult(content=content, citations=citations, model_used=model_used, finish_reason="stop")

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

    def _stream_local(self, prompt: str, max_tokens: int | None = None):
        """Stream response from llama-server (local GGUF model).

        Priority:
        1. Native /completion with think-skip prefill (fast path)
        2. OpenAI-compatible API for deep_plus reasoning_content
        """
        sp = self._get_local_system_prompt()
        in_thinking = False
        reasoning_mode = getattr(self._local, "reasoning_mode", "fast")
        is_fast = reasoning_mode == "fast"
        is_deep_plus = reasoning_mode in ("deep+", "deep_plus")
        local_ntokens = self._resolve_ntokens(max_tokens)

        logger.info(
            f"local_stream: mode={reasoning_mode} task={getattr(self._local, 'task_type', '')} "
            f"n_predict={local_ntokens} prompt_chars={len(prompt)}"
        )

        # Fast path: native /completion with empty think prefill
        if not is_deep_plus:
            try:
                full_prompt = self._apply_chat_template(sp, prompt)
                with self.http_client.stream(
                    "POST",
                    f"{self.llama_server_url}/completion",
                    json=self._completion_payload(full_prompt, local_ntokens, is_fast),
                    timeout=LOCAL_TIMEOUT,
                ) as response:
                    response.raise_for_status()
                    for line in self._sse_lines(response):
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            chunk = data.get("content", "")
                            # Track truncation from /completion SSE
                            if data.get("stop") and data.get("truncated"):
                                self._local.current_finish_reason = "length"
                            if chunk:
                                if chunk.strip().startswith("</think>"):
                                    chunk = chunk.replace("</think>", "", 1).lstrip("\r\n ")
                                if chunk:
                                    yield chunk
                        except Exception:
                            continue
                    return
            except (httpx.ConnectError, httpx.TimeoutException) as err:
                logger.error(f"Local LLM stream connection/timeout error: {err}")
                yield f"\n⚠️ Connection error: {err}\n"
                return
            except Exception as e:
                logger.warning(f"Native /completion on local failed ({e}), falling back to /v1/chat/completions...")

        # deep_plus or fallback: OpenAI chat completions
        messages = self._build_local_chat_messages(sp, prompt)
        if not is_deep_plus:
            messages.append({"role": "assistant", "content": "<think>\n</think>\n"})
        try:
            headers = {"Content-Type": "application/json"}
            payload = self._chat_payload(messages, local_ntokens, is_fast, stream=True)
            if is_deep_plus:
                payload.pop("enable_thinking", None)
                payload["chat_template_kwargs"] = {"enable_thinking": True}
            any_content = False
            with self.http_client.stream(
                "POST",
                f"{self.llama_server_url}/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=LOCAL_TIMEOUT,
            ) as response:
                response.raise_for_status()
                for line in self._sse_lines(response):
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        choices = data.get("choices", [])
                        if choices:
                            # Track finish_reason for truncation detection
                            fr = choices[0].get("finish_reason")
                            if fr in ("length", "truncated"):
                                self._local.current_finish_reason = "length"
                            elif fr == "stop":
                                self._local.current_finish_reason = "stop"
                        delta = choices[0]["delta"]
                        reasoning_chunk = delta.get("reasoning_content", "")
                        content_chunk = delta.get("content", "")
                        if reasoning_chunk:
                            if is_deep_plus:
                                if not in_thinking:
                                    yield "<think>\n"
                                    in_thinking = True
                                yield reasoning_chunk
                            any_content = True
                        if content_chunk:
                            if is_deep_plus and in_thinking:
                                yield "\n</think>\n"
                                in_thinking = False
                            if not is_deep_plus:
                                if "<think>" in content_chunk:
                                    in_thinking = True
                                    before = content_chunk.split("<think>")[0]
                                    if before:
                                        yield before
                                    continue
                                if "</think>" in content_chunk:
                                    in_thinking = False
                                    after = content_chunk.split("</think>")[-1]
                                    if after:
                                        yield after
                                    continue
                                if in_thinking:
                                    continue
                            yield content_chunk
                            any_content = True
                    except Exception:
                        continue
                if is_deep_plus and in_thinking:
                    yield "\n</think>\n"
                if any_content:
                    return
        except (httpx.ConnectError, httpx.TimeoutException) as err:
            logger.error(f"Local LLM stream connection/timeout error: {err}")
            yield f"\n⚠️ Connection error: {err}\n"
            return
        except Exception as e:
            logger.warning(f"OpenAI API on local failed ({e}), falling back to /completion...")

        # Last resort: native /completion without think skip (deep_plus template)
        try:
            full_prompt = self._apply_chat_template(sp, prompt)
            with self.http_client.stream(
                "POST",
                f"{self.llama_server_url}/completion",
                json=self._completion_payload(full_prompt, local_ntokens, is_fast),
                timeout=LOCAL_TIMEOUT,
            ) as response:
                response.raise_for_status()
                in_thinking = False
                for line in self._sse_lines(response):
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        # Track truncation from /completion SSE (last resort)
                        if data.get("stop") and data.get("truncated"):
                            self._local.current_finish_reason = "length"
                        chunk = data.get("content", "")
                        if not chunk:
                            continue
                        while chunk:
                            if not in_thinking:
                                idx = chunk.find("<think>")
                                if idx == -1:
                                    before, rest = chunk, ""
                                else:
                                    before = chunk[:idx]
                                    rest = chunk[idx + 7 :]
                                if before:
                                    yield before
                                if idx != -1:
                                    in_thinking = True
                                    if is_deep_plus:
                                        yield "<think>\n"
                                    chunk = rest
                                    continue
                                chunk = rest
                            else:
                                idx = chunk.find("</think>")
                                if idx == -1:
                                    if is_deep_plus:
                                        yield chunk
                                    chunk = ""
                                else:
                                    before = chunk[:idx]
                                    rest = chunk[idx + 8 :]
                                    if before and is_deep_plus:
                                        yield before
                                    if is_deep_plus:
                                        yield "\n</think>\n"
                                    in_thinking = False
                                    chunk = rest
                    except Exception:
                        continue
                if is_deep_plus and in_thinking:
                    yield "\n</think>\n"
        except httpx.ConnectError as err:
            logger.error(f"Local stream last-resort connection error: {err}")
            yield f"\n⚠️ Cannot connect to llama-server: {err}\n"
        except Exception as e:
            logger.error(f"Local stream last-resort failed: {e}")
            yield f"\n⚠️ Local model error: {e}\n"
