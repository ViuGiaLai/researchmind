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
        try:
            raw_map = json.loads(settings.task_provider_map)
            self.task_map = {str(k).lower(): str(v).lower() for k, v in raw_map.items()}
        except (TypeError, ValueError):
            self.task_map = {}
        self.fallbacks = [item.strip().lower() for item in settings.provider_fallback_chain.split(",") if item.strip()]

    def candidates(self, task_type: str) -> list[str]:
        primary = self.task_map.get(task_type.lower(), "gemini")
        result = [primary, *self.fallbacks]
        return [name for index, name in enumerate(result) if name not in result[:index] and self.available(name)]

    def available(self, provider: str) -> bool:
        key = getattr(self.settings, f"{provider}_api_key", "")
        if provider == "cloudflare":
            return bool(key and self.settings.cloudflare_url)
        return bool(key)

    def model(self, provider: str) -> str:
        return str(getattr(self.settings, f"{provider}_model", ""))

    async def generate(self, request: GenerateRequest) -> tuple[str, str, str]:
        errors = []
        for provider in self.candidates(request.task_type):
            try:
                if provider == "gemini":
                    content = await self._gemini(request)
                elif provider == "claude":
                    content = await self._claude(request)
                else:
                    content = await self._openai_compatible(provider, request)
                if content.strip():
                    return content, provider, self.model(provider)
            except Exception as exc:
                errors.append(f"{provider}: {exc}")
        raise ProviderError("No hosted AI provider succeeded. " + "; ".join(errors))

    async def stream(self, request: GenerateRequest) -> AsyncIterator[tuple[str, str, str]]:
        errors = []
        for provider in self.candidates(request.task_type):
            emitted = False
            try:
                stream = self._stream_gemini(request) if provider == "gemini" else self._stream_openai(provider, request)
                if provider == "claude":
                    content = await self._claude(request)
                    if content:
                        yield content, provider, self.model(provider)
                        return
                else:
                    async for chunk in stream:
                        emitted = True
                        yield chunk, provider, self.model(provider)
                    if emitted:
                        return
            except Exception as exc:
                if emitted:
                    raise ProviderError(f"{provider} stream interrupted: {exc}") from exc
                errors.append(f"{provider}: {exc}")
        raise ProviderError("No hosted AI provider succeeded. " + "; ".join(errors))

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
                        text = self._gemini_text(json.loads(line[6:]))
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
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    data = json.loads(line[6:])
                    chunk = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if chunk:
                        yield chunk

    def _openai_request(self, provider: str, request: GenerateRequest, stream: bool) -> tuple[str, dict, dict]:
        bases = {
            "groq": "https://api.groq.com/openai/v1",
            "openrouter": "https://openrouter.ai/api/v1",
            "cerebras": "https://api.cerebras.ai/v1",
            "cloudflare": self.settings.cloudflare_url.rstrip("/"),
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
            return "".join(item.get("text", "") for item in response.json().get("content", []) if item.get("type") == "text")

