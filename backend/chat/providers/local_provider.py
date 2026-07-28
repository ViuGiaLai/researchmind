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
from common.text_utils import count_tokens

from ..types import GenerationResult

# Connect fails fast if the server is down.
# Read timeout is per-chunk (resets on every received byte).
LOCAL_TIMEOUT = httpx.Timeout(connect=5.0, read=90.0, write=10.0, pool=5.0)

# Absolute floors/ceilings for local GGUF generation.
MIN_LOCAL_NTOKENS = 64
MAX_LOCAL_NTOKENS = 1024

# Default llama-server context limit (2048 tokens default).
DEFAULT_LOCAL_CTX = 2048

# Hard caps by reasoning mode — CPU decode is ~5–20 tok/s on small models.
LOCAL_MODE_CAPS: dict[str, int] = {
    "fast": 384,
    "deep": 512,
    "deep_plus": 1024,
    "deep+": 1024,
    "continue": 768,  # more tokens for Continue button
}

# Safe limit: how many auto-continue passes to attempt when truncated.
# Each pass generates up to LOCAL_MODE_CAPS['continue'] tokens.
# Total tokens per Continue click: (MAX_AUTO_CONTINUES + 1) * 768
# With ~8 tok/s on CPU, one pass = ~96s; 2 passes = ~192s.
# Set to 1 so total is 2*768 = 1536 tokens ≈ 3 min max.
MAX_AUTO_CONTINUES = 1

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


def _filter_think_tags(chunk: str, in_thinking: bool) -> tuple[str, bool]:
    """Filter out <think>...</think> blocks from a chunk when reasoning is disabled.

    Returns (filtered_text, new_in_thinking_state).
    """
    out = []
    curr = chunk
    while curr:
        if not in_thinking:
            idx = curr.find("<think>")
            if idx == -1:
                out.append(curr)
                break
            else:
                out.append(curr[:idx])
                curr = curr[idx + 7 :]
                in_thinking = True
        else:
            idx = curr.find("</think>")
            if idx == -1:
                break  # remaining text is inside <think>, suppress
            else:
                curr = curr[idx + 8 :]
                in_thinking = False
    res = "".join(out)
    if res.startswith("</think>"):
        res = res.replace("</think>", "", 1).lstrip("\r\n ")
    return res, in_thinking


def _strip_think_tags(content: str) -> str:
    """Remove <think>...</think> blocks from non-streaming generation content."""
    while "<think>" in content and "</think>" in content:
        start = content.find("<think>")
        end = content.find("</think>", start)
        if start != -1 and end != -1:
            content = content[:start] + content[end + 8 :]
        else:
            break
    if content.startswith("</think>"):
        content = content.replace("</think>", "", 1)
    return content.strip()


def _safe_error_text(err: httpx.HTTPStatusError) -> str:
    """Safely extract error text from httpx Response, reading streaming content if needed."""
    try:
        if hasattr(err.response, "read"):
            err.response.read()
        return err.response.text
    except Exception:
        return str(err)


def _clamp_local_n_predict(prompt_or_len: str | int, requested_n_predict: int, max_ctx: int = DEFAULT_LOCAL_CTX) -> int:
    """Ensure prompt_tokens + n_predict never exceeds max_ctx (default 2048 for llama-server)."""
    if isinstance(prompt_or_len, int):
        raw_tokens = prompt_or_len
    else:
        raw_tokens = count_tokens(prompt_or_len)

    # 1.15x multiplier to safely account for Qwen3 BPE tokenizer & ChatML special tokens
    prompt_tokens = int(raw_tokens * 1.15)
    safe_headroom = max_ctx - 128  # 1920 tokens safe budget
    allowed_n = safe_headroom - prompt_tokens
    if allowed_n < MIN_LOCAL_NTOKENS:
        allowed_n = MIN_LOCAL_NTOKENS
    return max(MIN_LOCAL_NTOKENS, min(requested_n_predict, allowed_n))


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
        raw_mode = str(getattr(self._local, "reasoning_mode", "fast") or "fast").lower()
        reasoning_mode = raw_mode
        task_type = str(getattr(self._local, "task_type", "") or "").lower()

        configured = int(getattr(self, "local_max_tokens", 512) or 512)
        mode_cap = LOCAL_MODE_CAPS.get(reasoning_mode, LOCAL_MODE_CAPS["fast"])
        task_cap = LOCAL_TASK_CAPS.get(task_type, mode_cap)

        if reasoning_mode in ("deep_plus", "deep+", "continue"):
            configured = max(configured, mode_cap)

        requested = int(max_tokens) if max_tokens else configured
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
        clamped_n = _clamp_local_n_predict(full_prompt, n_predict)
        payload = {
            "prompt": full_prompt,
            "n_predict": clamped_n,
            "stop": COMPLETION_STOP,
            "stream": True,
            **self._local_sampling(is_fast),
        }
        return payload

    def _chat_payload(self, messages: list[dict], n_predict: int, is_fast: bool, stream: bool) -> dict:
        # Qwen3 / llama-server: disable thinking when not in deep_plus.
        clamped_n = _clamp_local_n_predict(json.dumps(messages), n_predict)
        payload = {
            "model": "local",
            "messages": messages,
            "max_tokens": clamped_n,
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
            if role in ("user", "assistant") and isinstance(content, str) and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": current_user})
        return messages

    def _generate_local(
        self, prompt: str, system_prompt_override: str | None = None, max_tokens: int | None = None
    ) -> GenerationResult:
        sp = system_prompt_override or getattr(self, "_get_local_system_prompt", lambda: "")()
        if not sp and hasattr(self, "_get_system_prompt"):
            sp = self._get_system_prompt()
        model_used = f"local/{getattr(self, 'local_model', 'Qwen3-4B')}"
        reasoning_mode = getattr(self._local, "reasoning_mode", "fast")
        is_fast = reasoning_mode in ("fast", "continue")
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
                content = _strip_think_tags(content)
            except httpx.HTTPStatusError as err:
                if err.response.status_code == 400:
                    logger.warning(f"Local /completion returned 400 ({_safe_error_text(err)}), trying chat API...")
                else:
                    logger.error(f"Local LLM HTTP error: {err}")
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
                            choices = data.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {})
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
                    content = _strip_think_tags(raw_content) if not is_deep_plus else raw_content
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

        Auto-continue: when reasoning_mode is 'continue' and the model stops
        with finish_reason='length', it automatically re-generates for more tokens.
        """
        sp = getattr(self, "_get_local_system_prompt", lambda: "")()
        if not sp and hasattr(self, "_get_system_prompt"):
            sp = self._get_system_prompt()
        in_thinking = False
        reasoning_mode = getattr(self._local, "reasoning_mode", "fast")
        is_fast = reasoning_mode in ("fast", "continue")
        is_deep_plus = reasoning_mode in ("deep+", "deep_plus")

        # Auto-continue: transparently re-call when the model is truncated
        max_auto_continues = MAX_AUTO_CONTINUES if reasoning_mode == "continue" else 0
        auto_continue_count = 0
        all_accumulated: list[str] = []
        current_prompt = prompt
        history = getattr(self._local, "chat_history", None) or []
        base_assistant_prefill = (
            str(history[-1].get("content", ""))
            if reasoning_mode == "continue" and history and isinstance(history[-1], dict)
            else ""
        )
        assistant_prefill = ""

        while True:
            self._local.current_finish_reason = "pending"
            local_ntokens = self._resolve_ntokens(max_tokens)
            logger.info(
                f"local_stream: mode={reasoning_mode} task={getattr(self._local, 'task_type', '')} "
                f"n_predict={local_ntokens} prompt_chars={len(current_prompt)}"
            )

            accumulated: list[str] = []

            # Fast path: native /completion with empty think prefill
            if not is_deep_plus:
                try:
                    full_prompt = self._apply_chat_template(sp, current_prompt, assistant_prefill=assistant_prefill)
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
                                if data.get("stop"):
                                    self._local.current_finish_reason = "length" if data.get("truncated") else "stop"
                                if chunk:
                                    filtered_chunk, in_thinking = _filter_think_tags(chunk, in_thinking)
                                    if filtered_chunk:
                                        accumulated.append(filtered_chunk)
                                        all_accumulated.append(filtered_chunk)
                                        yield filtered_chunk
                            except Exception:
                                continue

                        if auto_continue_count >= max_auto_continues:
                            return
                        finish_reason = getattr(self._local, "current_finish_reason", "stop")
                        if finish_reason == "length" and auto_continue_count < max_auto_continues:
                            auto_continue_count += 1
                            logger.info(
                                f"AUTO_CONTINUE: pass {auto_continue_count}/{max_auto_continues} (finish_reason=length)"
                            )
                            assistant_prefill = base_assistant_prefill + "".join(all_accumulated)
                            continue
                        return
                except httpx.HTTPStatusError as err:
                    if err.response.status_code == 400:
                        logger.warning(f"Local /completion returned 400 ({_safe_error_text(err)}), trying chat API...")
                    else:
                        logger.error(f"Local stream HTTP error: {err}")
                except (httpx.ConnectError, httpx.TimeoutException) as err:
                    logger.error(f"Local LLM stream connection/timeout error: {err}")
                    self._local.current_finish_reason = "error"
                    return
                    return
                except Exception as e:
                    logger.warning(f"Native /completion on local failed ({e}), falling back to /v1/chat/completions...")

            # deep_plus or fallback: OpenAI chat completions
            messages = self._build_local_chat_messages(sp, current_prompt)
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
                                fr = choices[0].get("finish_reason")
                                if fr in ("length", "truncated"):
                                    self._local.current_finish_reason = "length"
                                elif fr == "stop":
                                    self._local.current_finish_reason = "stop"
                            delta = choices[0]["delta"] if choices else {}
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
                                    filtered_chunk, in_thinking = _filter_think_tags(content_chunk, in_thinking)
                                    if not filtered_chunk:
                                        continue
                                    content_chunk = filtered_chunk
                                yield content_chunk
                                accumulated.append(content_chunk)
                                all_accumulated.append(content_chunk)
                                any_content = True
                        except Exception:
                            continue
                    if is_deep_plus and in_thinking:
                        yield "\n</think>\n"
                    if any_content:
                        if auto_continue_count >= max_auto_continues:
                            return
                        finish_reason = getattr(self._local, "current_finish_reason", "stop")
                        if finish_reason == "length" and auto_continue_count < max_auto_continues:
                            auto_continue_count += 1
                            logger.info(
                                f"AUTO_CONTINUE: pass {auto_continue_count}/{max_auto_continues} (finish_reason=length)"
                            )
                            full_so_far = "".join(all_accumulated)
                            current_prompt = (
                                f"{prompt}\n\n"
                                f"[Assistant has written so far:\n{full_so_far}\n]\n"
                                "Continue from where it stopped. Do not repeat. Do not restart. Continue only."
                            )
                            continue
                        return
            except (httpx.ConnectError, httpx.TimeoutException) as err:
                if auto_continue_count == 0:
                    logger.error(f"Local LLM stream connection/timeout error: {err}")
                    self._local.current_finish_reason = "error"
                    return
                return
            except Exception as e:
                if auto_continue_count == 0:
                    logger.warning(f"OpenAI API on local failed ({e}), falling back to /completion...")
                else:
                    return

            # Last resort: native /completion without think skip (deep_plus template)
            try:
                full_prompt = self._apply_chat_template(sp, current_prompt)
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
                            if data.get("stop"):
                                self._local.current_finish_reason = "length" if data.get("truncated") else "stop"
                            chunk = data.get("content", "")
                            if not chunk:
                                continue
                            if not is_deep_plus:
                                filtered_chunk, in_thinking = _filter_think_tags(chunk, in_thinking)
                                if filtered_chunk:
                                    yield filtered_chunk
                                    accumulated.append(filtered_chunk)
                                    all_accumulated.append(filtered_chunk)
                            else:
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
                                            accumulated.append(before)
                                            all_accumulated.append(before)
                                        if idx != -1:
                                            in_thinking = True
                                            yield "<think>\n"
                                            chunk = rest
                                            continue
                                        chunk = rest
                                    else:
                                        idx = chunk.find("</think>")
                                        if idx == -1:
                                            yield chunk
                                            accumulated.append(chunk)
                                            all_accumulated.append(chunk)
                                            chunk = ""
                                        else:
                                            before = chunk[:idx]
                                            rest = chunk[idx + 8 :]
                                            if before:
                                                yield before
                                                accumulated.append(before)
                                                all_accumulated.append(before)
                                            yield "\n</think>\n"
                                            in_thinking = False
                                            chunk = rest
                        except Exception:
                            continue
                    if is_deep_plus and in_thinking:
                        yield "\n</think>\n"

                    if auto_continue_count >= max_auto_continues:
                        return
                    finish_reason = getattr(self._local, "current_finish_reason", "stop")
                    if finish_reason == "length" and auto_continue_count < max_auto_continues:
                        auto_continue_count += 1
                        logger.info(
                            f"AUTO_CONTINUE: pass {auto_continue_count}/{max_auto_continues} (finish_reason=length, last_resort)"
                        )
                        full_so_far = "".join(all_accumulated)
                        current_prompt = (
                            f"{prompt}\n\n"
                            f"[Assistant has written so far:\n{full_so_far}\n]\n"
                            "Continue from where it stopped. Do not repeat. Do not restart. Continue only."
                        )
                        continue
                    return
            except httpx.ConnectError as err:
                if auto_continue_count == 0:
                    logger.error(f"Local stream last-resort connection error: {err}")
                    self._local.current_finish_reason = "error"
                    return
                return
            except Exception as e:
                if auto_continue_count == 0:
                    logger.error(f"Local stream last-resort failed: {e}")
                    self._local.current_finish_reason = "error"
                    return
                return
