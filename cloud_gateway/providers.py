"""Small provider router used only by the hosted gateway."""

import json
from collections.abc import AsyncIterator
import httpx

from .config import GatewaySettings
from .schemas import GenerateRequest


class ProviderError(RuntimeError):
    pass


class ProviderRouter:
    def __init__(self, settings: GatewaySettings):
        self.settings = settings
        self.last_finish_reason = "stop"
        try:
            raw_map = json.loads(settings.task_provider_map)
            self.task_map = {str(k).lower(): str(v).lower() for k, v in raw_map.items()}
        except (TypeError, ValueError):
            self.task_map = {}
        try:
            raw_policy = json.loads(settings.routing_policy)
            self.routing_policy = {
                str(key).lower(): [str(item).lower() for item in value]
                for key, value in raw_policy.items() if isinstance(value, list)
            }
        except (TypeError, ValueError):
            self.routing_policy = {}
        self.fallbacks = [item.strip().lower() for item in settings.provider_fallback_chain.split(",") if item.strip()]

    @staticmethod
    def normalize_mode(reasoning_mode: str) -> str:
        mode = (reasoning_mode or "fast").strip().lower()
        return "deep_plus" if mode in {"deep+", "deep_plus"} else mode

    def route(self, task_type: str, reasoning_mode: str = "fast") -> tuple[str, list[str]]:
        task = (task_type or "chat").strip().lower()
        mode = self.normalize_mode(reasoning_mode)
        mode_key = f"{task}.{mode}"
        if mode_key in self.routing_policy:
            return mode_key, self.routing_policy[mode_key]
        if task in self.routing_policy:
            return task, self.routing_policy[task]
        primary = self.task_map.get(task, "gemini")
        return task, [primary, *self.fallbacks]

    def candidates(self, task_type: str, reasoning_mode: str = "fast") -> list[str]:
        _, planned = self.route(task_type, reasoning_mode)
        return [
            name for index, name in enumerate(planned)
            if name not in planned[:index] and self.available(name)
        ]

    def available(self, provider: str) -> bool:
        key = getattr(self.settings, f"{provider}_api_key", "")
        if provider == "cloudflare":
            return bool(key and self.settings.cloudflare_url)
        return bool(key)

    def model(self, provider: str) -> str:
        return str(getattr(self.settings, f"{provider}_model", ""))

    def routing_metadata(self, request: GenerateRequest, selected: str, failures: list[str]) -> dict:
        routing_key, planned = self.route(request.task_type, request.reasoning_mode)
        primary = planned[0] if planned else ""
        fallback_used = bool(primary and selected != primary)
        if not fallback_used:
            reason = ""
        elif not self.available(primary):
            reason = f"{primary} is not configured or unavailable"
        elif failures:
            reason = failures[-1]
        else:
            reason = f"{primary} did not return a usable response"
        return {
            "primary_provider": primary,
            "selected_provider": selected,
            "fallback_used": fallback_used,
            "fallback_reason": reason,
            "routing_key": routing_key,
        }

    async def generate(self, request: GenerateRequest) -> tuple[str, str, str, dict]:
        failures: list[str] = []
        for provider in self.candidates(request.task_type, request.reasoning_mode):
            try:
                if provider == "gemini":
                    content = await self._gemini(request)
                elif provider == "claude":
                    content = await self._claude(request)
                else:
                    content = await self._openai_compatible(provider, request)
                if content.strip():
                    return content, provider, self.model(provider), self.routing_metadata(request, provider, failures)
                failures.append(f"{provider} returned an empty response")
            except Exception as exc:
                failures.append(f"{provider} failed ({type(exc).__name__})")
        raise ProviderError("No hosted AI provider succeeded. " + "; ".join(failures))

    async def stream(self, request: GenerateRequest) -> AsyncIterator[tuple[str, str, str, dict]]:
        failures: list[str] = []
        for provider in self.candidates(request.task_type, request.reasoning_mode):
            emitted = False
            metadata = self.routing_metadata(request, provider, failures)
            try:
                stream = self._stream_gemini(request) if provider == "gemini" else self._stream_openai(provider, request)
                if provider == "claude":
                    content = await self._claude(request)
                    if content:
                        yield content, provider, self.model(provider), metadata
                        return
                else:
                    async for chunk in stream:
                        emitted = True
                        yield chunk, provider, self.model(provider), metadata
                    if emitted:
                        return
                    failures.append(f"{provider} returned an empty response")
            except Exception as exc:
                if emitted:
                    raise ProviderError(f"{provider} stream interrupted ({type(exc).__name__})") from exc
                failures.append(f"{provider} failed ({type(exc).__name__})")
        raise ProviderError("No hosted AI provider succeeded. " + "; ".join(failures))
    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        key = self.settings.gemini_api_key
        if not key:
            raise ProviderError("Hosted embedding is not configured")
        requests = [
            {"model": f"models/{model}", "content": {"parts": [{"text": text}]}}
            for text in texts
        ]
        async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents",
                params={"key": key}, json={"requests": requests},
            )
            response.raise_for_status()
            return [item.get("values", []) for item in response.json().get("embeddings", [])]

    async def _gemini(self, request: GenerateRequest) -> str:
        model = self.settings.gemini_model
        payload = self._gemini_payload(request)
        async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": self.settings.gemini_api_key}, json=payload,
            )
            response.raise_for_status()
            return self._gemini_text(response.json())

    async def _stream_gemini(self, request: GenerateRequest) -> AsyncIterator[str]:
        model = self.settings.gemini_model
        async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
            async with client.stream(
                "POST",
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent",
                params={"key": self.settings.gemini_api_key, "alt": "sse"},
                json=self._gemini_payload(request),
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = json.loads(line[6:])
                        if "error" in data:
                            err = data["error"]
                            msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                            raise ProviderError(f"Gemini error: {msg}")
                        
                        candidates = data.get("candidates", [])
                        if candidates:
                            finish_reason = candidates[0].get("finishReason")
                            if finish_reason == "MAX_TOKENS":
                                self.last_finish_reason = "length"
                            elif finish_reason:
                                self.last_finish_reason = "stop"
                            if finish_reason and finish_reason not in ("STOP", "MAX_TOKENS"):
                                raise ProviderError(f"Gemini stopped unexpectedly: {finish_reason}")
                                
                        text = self._gemini_text(data)
                        if text:
                            yield text

    def _gemini_payload(self, request: GenerateRequest) -> dict:
        payload = {
            "contents": [{"role": "user", "parts": [{"text": request.user_prompt}]}],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens,
            },
        }
        if request.system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": request.system_prompt}]}
        return payload

    @staticmethod
    def _gemini_text(data: dict) -> str:
        candidates = data.get("candidates", [])
        if not candidates:
            return ""
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(str(part.get("text", "")) for part in parts)

    async def _openai_compatible(self, provider: str, request: GenerateRequest) -> str:
        url, headers, payload = self._openai_request(provider, request, stream=False)
        async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json().get("choices", [{}])[0].get("message", {}).get("content", "")

    async def _stream_openai(self, provider: str, request: GenerateRequest) -> AsyncIterator[str]:
        url, headers, payload = self._openai_request(provider, request, stream=True)
        async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line == "data: [DONE]":
                        continue
                    if line.startswith("data: "):
                        data = json.loads(line[6:])
                    elif line.startswith("{") and "error" in line:
                        data = json.loads(line)
                    else:
                        continue

                    if "error" in data:
                        err = data["error"]
                        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                        raise ProviderError(f"Provider error: {msg}")

                    choices = data.get("choices", [])
                    if choices:
                        finish_reason = choices[0].get("finish_reason")
                        if finish_reason in {"length", "max_tokens"}:
                            self.last_finish_reason = "length"
                        elif finish_reason:
                            self.last_finish_reason = "stop"
                        if finish_reason and finish_reason not in ("stop", "length"):
                            raise ProviderError(f"Provider stopped unexpectedly: {finish_reason}")
                            
                        chunk = choices[0].get("delta", {}).get("content", "")
                        if chunk:
                            yield chunk

    def _openai_request(self, provider: str, request: GenerateRequest, stream: bool) -> tuple[str, dict, dict]:
        bases = {
            "groq": "https://api.groq.com/openai/v1",
            "openrouter": "https://openrouter.ai/api/v1",
            "openrouter_r1": "https://openrouter.ai/api/v1",
            "cerebras": "https://api.cerebras.ai/v1",
            "cloudflare": self.settings.cloudflare_url.rstrip("/"),
            "deepseek": "https://api.deepseek.com",
            "github": "https://models.inference.ai.azure.com",
            "github_deepseek_v3": "https://models.inference.ai.azure.com",
            "nvidia": "https://integrate.api.nvidia.com/v1",
            "nvidia_deepseek": "https://integrate.api.nvidia.com/v1",
            "freemodel": "https://freemodel.dev/v1",
            "cohere": "https://api.cohere.ai/compatibility/v1",
        }
        if provider not in bases:
            raise ProviderError(f"Unsupported provider: {provider}")
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.user_prompt})
        return (
            f"{bases[provider]}/chat/completions",
            {"Authorization": f"Bearer {getattr(self.settings, f'{provider}_api_key')}", "Content-Type": "application/json"},
            {"model": self.model(provider), "messages": messages, "temperature": request.temperature, "max_tokens": request.max_tokens, "stream": stream},
        )

    async def _claude(self, request: GenerateRequest) -> str:
        headers = {
            "x-api-key": self.settings.claude_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": self.settings.claude_model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "messages": [{"role": "user", "content": request.user_prompt}],
        }
        if request.system_prompt:
            payload["system"] = request.system_prompt
        async with httpx.AsyncClient(timeout=self.settings.provider_timeout) as client:
            response = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            self.last_finish_reason = "length" if data.get("stop_reason") == "max_tokens" else "stop"
            return "".join(item.get("text", "") for item in data.get("content", []) if item.get("type") == "text")

