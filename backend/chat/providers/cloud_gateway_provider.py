"""Hosted inference adapter with no upstream provider credentials."""

import json

import httpx
from loguru import logger

from common.request_context import get_request_bearer_token

from ..types import GenerationResult


class CloudGatewayProviderMixin:
    def _gateway_headers(self) -> dict[str, str]:
        shared = getattr(self, "researchmind_cloud_token", "")
        user_token = get_request_bearer_token()
        headers = {"Content-Type": "application/json"}
        if shared:
            headers["Authorization"] = f"Bearer {shared}"
            if user_token:
                headers["X-User-Token"] = user_token
        elif user_token:
            headers["Authorization"] = f"Bearer {user_token}"
        return headers

    def _gateway_payload(self, prompt: str, max_tokens: int, system_prompt_override: str | None = None) -> dict:
        return {
            "task_type": getattr(self._local, "task_type", "chat") or "chat",
            "reasoning_mode": getattr(self._local, "reasoning_mode", "fast") or "fast",
            "system_prompt": system_prompt_override or self._get_system_prompt(),
            "user_prompt": prompt,
            "language": getattr(self._local, "lang", "auto"),
            "max_tokens": max_tokens,
            "temperature": 0.3,
        }

    @staticmethod
    def _gateway_routing_reason(data: dict) -> str:
        routing_key = str(data.get("routing_key", ""))
        selected = str(data.get("selected_provider") or data.get("provider", ""))
        primary = str(data.get("primary_provider", ""))
        if data.get("fallback_used"):
            reason = str(data.get("fallback_reason", "")).strip()
            return f"{routing_key}: {primary} -> {selected} (fallback: {reason})"
        return f"{routing_key}: {selected} (primary)" if routing_key else ""

    def _generate_cloud_gateway(
        self, prompt: str, max_tokens: int = 1024, system_prompt_override: str | None = None
    ) -> GenerationResult:
        try:
            response = self.http_client.post(
                f"{self.researchmind_cloud_url}/v1/generate",
                headers=self._gateway_headers(),
                json=self._gateway_payload(prompt, max_tokens, system_prompt_override),
                timeout=self.researchmind_cloud_timeout,
            )
            response.raise_for_status()
            data = response.json()
            content = str(data.get("content", ""))
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(
                content=content,
                citations=citations,
                model_used=f"researchmind_cloud/{data.get('provider', 'unknown')}/{data.get('model', 'unknown')}",
                router_reason=self._gateway_routing_reason(data),
                finish_reason=str(data.get("finish_reason", "stop")),
            )
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            logger.warning("ResearchMind gateway returned HTTP {}", status)
            self._local.last_provider_failure = {
                "kind": "rate_limit" if status == 429 else "gateway_http",
                "retryable": status >= 500,
            }
            if status == 429:
                return GenerationResult(
                    content="free_30_limit",
                    citations=[],
                    model_used="researchmind_cloud/error",
                    finish_reason="error",
                )
        except Exception as exc:
            logger.warning("ResearchMind gateway failed: {}", exc)
        return GenerationResult(
            content="The hosted AI service is temporarily unavailable.",
            citations=[],
            model_used="researchmind_cloud/error",
            finish_reason="error",
        )

    def _stream_cloud_gateway(self, prompt: str, max_tokens: int = 1024):
        with httpx.Client(timeout=self.researchmind_cloud_timeout) as client:
            try:
                with client.stream(
                    "POST",
                    f"{self.researchmind_cloud_url}/v1/generate/stream",
                    headers=self._gateway_headers(),
                    json=self._gateway_payload(prompt, max_tokens),
                ) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line:
                            continue
                        event = json.loads(line)
                        event_type = event.get("type")
                        if event_type == "meta":
                            self._set_model(
                                f"researchmind_cloud/{event.get('provider', 'unknown')}/{event.get('model', 'unknown')}"
                            )
                            routing_reason = self._gateway_routing_reason(event)
                            self._local.current_router_reason = routing_reason
                            self.current_router_reason = routing_reason
                        elif event_type == "delta":
                            yield str(event.get("content", ""))
                        elif event_type == "error":
                            raise RuntimeError(str(event.get("content", "Gateway stream failed")))
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                logger.warning("Gateway stream HTTP {}", status)
                gateway_error = "free_30_limit" if status == 429 else "cloud_unavailable"
                self._local.stream_gateway_error = gateway_error
                self._stream_gateway_error = gateway_error
