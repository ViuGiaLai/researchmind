"""LLM response generation with citation verification.

Supports:
- Local: llama-server (GGUF models via llama.cpp)
- Cloud: 12 providers (GitHub, Gemini, Groq, NVIDIA, FreeModel, OpenRouter,
         Cohere, Cloudflare, Cerebras, DeepSeek, Claude)
- Per-task provider routing + fallback
- Citation verification: every claim must cite a source

Provider implementations are split into backend/chat/providers/*.py mixins.
"""

from typing import Optional
import json
import re
import threading
import time
import httpx
from loguru import logger
from config.settings import settings
from common.text_utils import redact_api_key
from common.i18n import get_language_instruction

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    import anthropic

from .types import GenerationResult
from .prompt_budget import fit_prompt_for_provider, get_provider_input_budget, trim_context_text
from .providers.openai_provider import OpenAIProviderMixin
from .providers.gemini_provider import GeminiProviderMixin
from .providers.claude_provider import ClaudeProviderMixin
from .providers.local_provider import LocalProviderMixin
from .providers.cloud_gateway_provider import CloudGatewayProviderMixin
from .cache_version import cache_fingerprint
from .provider_resilience import provider_health
from common.ai_observability import trace
from common.prompt_security import neutralize_untrusted_text, redact_sensitive_text
from .prompt_factory import build_rag_user_prompt, build_system_prompt
from .failure_policy import classify_failure


class Generator(
    OpenAIProviderMixin,
    GeminiProviderMixin,
    ClaudeProviderMixin,
    LocalProviderMixin,
    CloudGatewayProviderMixin,
):
    """LLM response generator.

    Takes a query + retrieved context, sends to LLM, verifies citations.
    Provider methods (_generate_github, _generate_gemini, _stream_openai, etc.)
    are inherited from the mixin classes in providers/.
    """

    def __init__(
        self,
        llama_server_url: str = "http://127.0.0.1:8080",
        local_model: str = "Qwen3-4B-Q4_K_M.gguf",
        claude_api_key: str = "",
        claude_model: str = "claude-sonnet-4-20250514",
        deepseek_api_key: str = "",
        deepseek_model: str = "deepseek-chat",
        gemini_api_key: str = "",
        gemini_model: str = "gemini-2.5-flash",
        groq_api_key: str = "",
        groq_model: str = "llama-3.3-70b-instant",
        nvidia_api_key: str = "",
        nvidia_model: str = "moonshotai/kimi-k2.6",
        nvidia_url: str = "https://integrate.api.nvidia.com/v1",
        nvidia_deepseek_api_key: str = "",
        nvidia_deepseek_model: str = "deepseek-ai/deepseek-v4-pro",
        github_api_key: str = "",
        github_model: str = "gpt-4o-mini",
        github_url: str = "https://models.inference.ai.azure.com",
        github_deepseek_v3_api_key: str = "",
        github_deepseek_v3_model: str = "DeepSeek-V3-0324",
        freemodel_api_key: str = "",
        freemodel_model: str = "gpt-4o-mini",
        freemodel_url: str = "https://freemodel.dev/v1",
        openrouter_api_key: str = "",
        openrouter_model: str = "deepseek/deepseek-v4-flash",
        openrouter_url: str = "https://openrouter.ai/api/v1",
        openrouter_api_deep_key: str = "",
        openrouter_deep_model: str = "deepseek/deepseek-r1",
        openrouter_url_deep: str = "https://openrouter.ai/api/v1",
        cohere_api_key: str = "",
        cohere_model: str = "command-r-plus",
        cohere_url: str = "https://api.cohere.ai/compatibility/v1",
        cloudflare_api_key: str = "",
        cloudflare_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        cloudflare_url: str = "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1",
        cerebras_api_key: str = "",
        cerebras_model: str = "qwen-3-235b-a22b-instruct-2507",
        cerebras_url: str = "https://api.cerebras.net/v1",
        mode: str = "cloud_free",
        task_provider_map: Optional[str] = None,
        custom_cloud_provider: str = "deepseek",
        local_max_tokens: int = 160,
        task_ultimate_fallback_chain: str = "",
        researchmind_cloud_url: str = "",
        researchmind_cloud_token: str = "",
        researchmind_cloud_timeout: float = 120.0,
    ):
        self.llama_server_url = llama_server_url.rstrip("/")
        self.local_model = local_model
        self.claude_api_key = claude_api_key
        self.claude_model = claude_model
        self.deepseek_api_key = deepseek_api_key
        self.deepseek_model = deepseek_model
        self.gemini_api_key = gemini_api_key
        self.gemini_model = gemini_model
        self.groq_api_key = groq_api_key
        self.groq_model = groq_model
        self.nvidia_api_key = nvidia_api_key
        self.nvidia_model = nvidia_model
        self.nvidia_url = nvidia_url.rstrip("/")
        self.nvidia_deepseek_api_key = nvidia_deepseek_api_key
        self.nvidia_deepseek_model = nvidia_deepseek_model
        self.github_api_key = github_api_key
        self.github_model = github_model
        self.github_url = github_url.rstrip("/")
        self.github_deepseek_v3_api_key = github_deepseek_v3_api_key
        self.github_deepseek_v3_model = github_deepseek_v3_model
        self.freemodel_api_key = freemodel_api_key
        self.freemodel_model = freemodel_model
        self.freemodel_url = freemodel_url.rstrip("/")
        self.openrouter_api_key = openrouter_api_key
        self.openrouter_model = openrouter_model
        self.openrouter_url = openrouter_url.rstrip("/")
        self.openrouter_api_deep_key = openrouter_api_deep_key
        self.openrouter_deep_model = openrouter_deep_model
        self.openrouter_url_deep = openrouter_url_deep.rstrip("/")
        self.cohere_api_key = cohere_api_key
        self.cohere_model = cohere_model
        self.cohere_url = cohere_url.rstrip("/")
        self.cloudflare_api_key = cloudflare_api_key
        self.cloudflare_model = cloudflare_model
        self.cloudflare_url = cloudflare_url.rstrip("/")
        self.cerebras_api_key = cerebras_api_key
        self.cerebras_model = cerebras_model
        self.cerebras_url = cerebras_url.rstrip("/")
        self.mode = "cloud_custom" if mode == "cloud" else mode
        self.custom_cloud_provider = custom_cloud_provider
        self.researchmind_cloud_url = researchmind_cloud_url.rstrip("/")
        self.researchmind_cloud_token = researchmind_cloud_token
        self.researchmind_cloud_timeout = researchmind_cloud_timeout

        # Per-task provider routing (Phase 1)
        self.task_provider_map: dict[str, str] = {}
        self._parse_task_provider_map(task_provider_map if task_provider_map is not None else settings.task_provider_map)

        # Per-task fallback provider (Phase 4A)
        self.task_fallback_map: dict[str, str] = {}
        self._parse_task_fallback_map(settings.task_fallback_map)

        # Ultimate fallback chain (Phase 4B) — comma-separated providers from best to worst
        raw_chain = task_ultimate_fallback_chain or getattr(settings, "task_ultimate_fallback_chain", "")
        self.ultimate_fallback_chain = [p.strip().lower() for p in raw_chain.split(",") if p.strip()] if raw_chain else []

        self.local_max_tokens = max(64, min(int(local_max_tokens or 160), 1024))
        self.current_model: str = ""
        self.current_router_reason: str = ""
        self.current_token_count: int = 0
        self._http_client = None
        self._local = threading.local()

    MODE_MAX_TOKENS = {
        "chat": 1024,
        "summary": 512,
        "verify": 1536,
        "review": 2048,
        # Fast paths used by Review Builder.
        "review_outline": 640,
        "review_section": 1100,
        "critique": 1536,
        "debate": 2048,
        "gap": 1536,
        "quality_check": 1024,
        "preview": 384,
        "default": 1024,
    }

    # ── Routing helpers ────────────────────────────────────────

    def _set_request_routing_context(
        self,
        task_type: str = "chat",
        reasoning_mode: str = "fast",
    ) -> tuple[str, str]:
        """Initialize per-request routing state and prevent thread-local leakage."""
        task = (task_type or "chat").strip().lower()
        mode = (reasoning_mode or "fast").strip().lower()
        if mode in {"deep+", "deep_plus"}:
            mode = "deep_plus"
        elif mode not in {"fast", "deep"}:
            mode = "fast"
        self._local.task_type = task
        self._local.reasoning_mode = mode
        return task, mode

    def _parse_task_provider_map(self, raw: str):
        if not raw or not raw.strip():
            self.task_provider_map = {}
            return
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                self.task_provider_map = {k.strip().lower(): v.strip().lower() for k, v in parsed.items()}
                logger.info(f"Loaded task_provider_map: {self.task_provider_map}")
            else:
                self.task_provider_map = {}
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse task_provider_map: {e}")
            self.task_provider_map = {}

    def _parse_task_fallback_map(self, raw: str):
        if not raw or not raw.strip():
            self.task_fallback_map = {}
            return
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                self.task_fallback_map = {k.strip().lower(): v.strip().lower() for k, v in parsed.items()}
                logger.info(f"Loaded task_fallback_map: {self.task_fallback_map}")
            else:
                self.task_fallback_map = {}
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse task_fallback_map: {e}")
            self.task_fallback_map = {}

    def _get_provider_for_task(self, task_type: str) -> str | None:
        task_type = task_type.strip().lower() if task_type else ""
        if not task_type:
            return None

        if self.researchmind_cloud_url and self.mode == "cloud_free":
            return "researchmind_cloud"
        
        # An explicit per-task route is authoritative. Reasoning-mode routing is
        # only a default when the task has no configured provider.
        provider = self.task_provider_map.get(task_type)
        if provider:
            return provider

        # Dynamic routing for chat/rag tasks based on reasoning_mode
        if task_type in ("chat", "rag"):
            mode = getattr(self._local, "reasoning_mode", "fast")
            if mode == "fast":
                return "github"
            elif mode == "deep":
                return "openrouter"
            elif mode in ("deep_plus", "deep+"):
                return "openrouter_r1"

        # Respect configured task_provider_map first
        provider = self.task_provider_map.get(task_type)
        if provider:
            return provider

        # Fallback hardcoded defaults when no task_provider_map entry
        if task_type in ("critique", "debate", "insight", "gap"):
            if self.groq_api_key:
                return "groq"
            if self.github_api_key:
                return "github"
            if self.github_deepseek_v3_api_key:
                return "github_deepseek_v3"
            logger.warning(f"No API key and no task_provider_map entry for {task_type}")

        if task_type in ("summary", "review", "quality_check"):
            if self.groq_api_key:
                return "groq"
            if task_type == "quality_check":
                return None

        return None

    def _get_fallback_for_task(self, task_type: str) -> str | None:
        task_type = task_type.strip().lower() if task_type else ""
        if not task_type:
            return None

        # Dynamic routing for chat/rag tasks based on reasoning_mode
        if task_type in ("chat", "rag"):
            mode = getattr(self._local, "reasoning_mode", "fast")
            if mode == "fast":
                fb = self.task_fallback_map.get(task_type) or "openrouter"
                return fb
            elif mode == "deep":
                return self.task_fallback_map.get(task_type) or "gemini"
            elif mode in ("deep_plus", "deep+"):
                return self.task_fallback_map.get(task_type) or "gemini"

        # Respect configured task_fallback_map first
        fb = self.task_fallback_map.get(task_type)
        if fb:
            return fb

        # Fallback hardcoded defaults when no task_fallback_map entry
        if task_type in ("critique", "debate", "insight", "gap"):
            for provider, key_attr in [
                ("gemini", "gemini_api_key"),
                ("nvidia", "nvidia_api_key"),
                ("freemodel", "freemodel_api_key"),
                ("cerebras", "cerebras_api_key"),
            ]:
                if getattr(self, key_attr, None):
                    return provider

        return None

    def _get_fallback_chain(self, task_type: str) -> list[str]:
        """Get ordered fallback chain for a task.
        Returns list of providers to try in sequence after primary fails.
        """
        chain: list[str] = []
        task_type = task_type.strip().lower() if task_type else ""
        if not task_type:
            return chain

        # Start with the configured fallback from task_fallback_map
        fb = self._get_fallback_for_task(task_type)
        if fb:
            chain.append(fb)

        # Quality check: also try other fast providers as additional fallbacks
        if task_type == "quality_check":
            for p, key_attr in [
                ("cerebras", "cerebras_api_key"),
                ("freemodel", "freemodel_api_key"),
                ("gemini", "gemini_api_key"),
                ("nvidia", "nvidia_api_key"),
                ("cloudflare", "cloudflare_api_key"),
                ("cohere", "cohere_api_key"),
            ]:
                if p not in chain and getattr(self, key_attr, None):
                    chain.append(p)

        return provider_health.rank(chain)

    # ── Non-streaming provider dispatch ────────────────────────

    def _fit_prompt(self, user_prompt: str, provider: str, max_tokens: int, system_prompt_override: str | None = None) -> str:
        sp = system_prompt_override or self._get_system_prompt()
        fitted, _ = fit_prompt_for_provider(user_prompt, sp, provider, max_tokens or 1024)
        return fitted

    def _get_context_budget_provider(self, task_type: str) -> str:
        """Pick provider with the largest input budget among primary + fallbacks."""
        providers: list[str] = []
        primary = self._get_provider_for_task(task_type)
        if primary:
            providers.append(primary)
        for fb in self._get_fallback_chain(task_type):
            if fb not in providers:
                providers.append(fb)
        if not providers:
            return "groq"
        return max(providers, key=get_provider_input_budget)

    def _trim_review_context(
        self,
        context_text: str,
        query: str,
        task_type: str,
        max_tokens: int,
    ) -> str:
        if task_type != "review" or not context_text or context_text == "__EXTERNAL_KNOWLEDGE__":
            return context_text
        provider = self._get_context_budget_provider(task_type)
        return trim_context_text(
            context_text,
            query,
            provider,
            max_tokens or 1024,
            self._get_system_prompt(),
        )

    def _call_provider(
        self,
        provider: str,
        user_prompt: str,
        max_tokens: int = 1024,
        system_prompt_override: str | None = None,
    ) -> GenerationResult | None:
        """Try a single provider by name.
        Returns GenerationResult on success, None if no key or error.
        """
        user_prompt = self._fit_prompt(user_prompt, provider, max_tokens, system_prompt_override)
        try:
            if provider == "researchmind_cloud":
                if not self.researchmind_cloud_url:
                    return None
                return self._generate_cloud_gateway(user_prompt, max_tokens, system_prompt_override)
            elif provider == "github":
                if not self.github_api_key:
                    return None
                return self._generate_github(user_prompt, self.github_api_key, self.github_model, max_tokens, system_prompt_override)
            elif provider == "github_deepseek_v3":
                if not self.github_deepseek_v3_api_key:
                    return None
                return self._generate_github(user_prompt, self.github_deepseek_v3_api_key, self.github_deepseek_v3_model, max_tokens, system_prompt_override)
            elif provider == "gemini":
                if not self.gemini_api_key:
                    return None
                return self._generate_gemini(user_prompt, self.gemini_api_key, max_tokens, True, system_prompt_override)
            elif provider == "deepseek":
                if not self.deepseek_api_key:
                    return None
                return self._generate_deepseek(user_prompt, self.deepseek_api_key, max_tokens, False, system_prompt_override)
            elif provider == "groq":
                if not self.groq_api_key:
                    return None
                return self._generate_groq(user_prompt, self.groq_api_key, self.groq_model, max_tokens, system_prompt_override)
            elif provider == "nvidia":
                if not self.nvidia_api_key:
                    return None
                return self._generate_nvidia(user_prompt, self.nvidia_api_key, self.nvidia_model, max_tokens, system_prompt_override)
            elif provider == "nvidia_deepseek":
                if not self.nvidia_deepseek_api_key:
                    return None
                return self._generate_nvidia(user_prompt, self.nvidia_deepseek_api_key, self.nvidia_deepseek_model, max_tokens, system_prompt_override)
            elif provider == "openrouter_r1":
                if not self.openrouter_api_deep_key:
                    return None
                return self._generate_openrouter(user_prompt, self.openrouter_api_deep_key, self.openrouter_deep_model, max_tokens, system_prompt_override)
            elif provider == "freemodel":
                if not self.freemodel_api_key:
                    return None
                return self._generate_freemodel(user_prompt, self.freemodel_api_key, self.freemodel_model, max_tokens, system_prompt_override)
            elif provider == "openrouter":
                if not self.openrouter_api_key:
                    return None
                return self._generate_openrouter(user_prompt, self.openrouter_api_key, self.openrouter_model, max_tokens, system_prompt_override)
            elif provider == "cohere":
                if not self.cohere_api_key:
                    return None
                return self._generate_cohere(user_prompt, self.cohere_api_key, self.cohere_model, max_tokens, system_prompt_override)
            elif provider == "cloudflare":
                if not self.cloudflare_api_key:
                    return None
                return self._generate_cloudflare(user_prompt, self.cloudflare_api_key, self.cloudflare_model, max_tokens, system_prompt_override)
            elif provider == "cerebras":
                if not self.cerebras_api_key:
                    return None
                return self._generate_cerebras(user_prompt, self.cerebras_api_key, self.cerebras_model, max_tokens, system_prompt_override)
            elif provider == "claude":
                if not self.claude_api_key:
                    return None
                return self._generate_claude(user_prompt, max_tokens, system_prompt_override)
            elif provider == "local":
                return self._generate_local(user_prompt, system_prompt_override, max_tokens)
            else:
                logger.warning(f"_call_provider: unknown provider '{provider}'")
                return None
        except Exception as e:
            failure = classify_failure(e)
            self._local.last_provider_failure = failure
            logger.warning(f"_call_provider: {provider} failed kind={failure['kind']}: {e}")
            return None

    def _call_provider_with_retry(
        self,
        provider: str,
        user_prompt: str,
        max_tokens: int = 1024,
        system_prompt_override: str | None = None,
    ) -> GenerationResult | None:
        """Call one provider with bounded retry and consistent telemetry."""
        if not provider_health.available(provider):
            logger.warning(f"AI_PROVIDER provider={provider} circuit=open")
            return None
        retries = max(0, min(int(getattr(settings, "provider_max_retries", 1)), 3))
        backoff = max(0.0, float(getattr(settings, "provider_retry_backoff", 0.35)))
        for attempt in range(retries + 1):
            self._local.last_provider_failure = None
            started = time.monotonic()
            with trace("llm.provider", provider=provider, attempt=attempt + 1):
                result = self._call_provider(
                    provider, user_prompt, max_tokens, system_prompt_override
                )
            elapsed_ms = int((time.monotonic() - started) * 1000)
            finish = result.finish_reason if result is not None else "unavailable"
            logger.info(
                f"AI_PROVIDER provider={provider} attempt={attempt + 1} "
                f"elapsed_ms={elapsed_ms} finish={finish}"
            )
            provider_health.record(
                provider,
                result is not None and result.finish_reason != "error",
                elapsed_ms,
            )
            if result is not None and result.finish_reason != "error":
                return result
            failure = getattr(self._local, "last_provider_failure", None)
            if failure is not None and not failure["retryable"]:
                break
            if attempt < retries:
                time.sleep(backoff * (2 ** attempt))
        return result

    def _route_by_task(
        self,
        task_type: str,
        user_prompt: str,
        max_tokens: int = 1024,
        system_prompt_override: str | None = None,
    ) -> GenerationResult | None:
        """Route to the mapped provider for this task_type.
        Tries primary first, then fallback chain, then returns None.
        Returns GenerationResult on success, None if all fail.
        """
        task_type, _ = self._set_request_routing_context(
            task_type, getattr(self._local, "reasoning_mode", "fast")
        )
        provider = self._get_provider_for_task(task_type)
        if not provider:
            return None

        logger.info(f"task_routing: {task_type} → {provider} (primary)")
        result = self._call_provider_with_retry(provider, user_prompt, max_tokens, system_prompt_override)
        if result is not None and result.finish_reason != "error":
            return result

        # Try fallback chain (primary → fb1 → fb2 → ... → default chain)
        fallbacks = self._get_fallback_chain(task_type)
        for fb in fallbacks:
            if fb == provider:
                continue
            logger.info(f"task_routing: {task_type} primary={provider} failed, trying fallback={fb}")
            result = self._call_provider_with_retry(fb, user_prompt, max_tokens, system_prompt_override)
            if result is not None and result.finish_reason != "error":
                return result
            logger.warning(f"task_routing: {task_type} fallback={fb} also failed")

        logger.info(f"task_routing: {task_type} all fallbacks failed")
        return None

    # ── Streaming provider dispatch ────────────────────────────

    def _stream_provider(self, provider: str, user_prompt: str, max_tokens: int = 1024):
        """Stream from a single provider by name.
        Yields chunks if provider works, otherwise returns (no yield = fallback).
        """
        user_prompt = self._fit_prompt(user_prompt, provider, max_tokens)
        try:
            if provider == "researchmind_cloud":
                if not self.researchmind_cloud_url:
                    return
                yield from self._stream_cloud_gateway(user_prompt, max_tokens)
                return
            elif provider == "github":
                if not self.github_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.github_api_key, self.github_model, self.github_url, max_tokens)
                return
            elif provider == "github_deepseek_v3":
                if not self.github_deepseek_v3_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.github_deepseek_v3_api_key, self.github_deepseek_v3_model, self.github_url, max_tokens)
                return
            elif provider == "gemini":
                if not self.gemini_api_key:
                    return
                yield from self._stream_gemini(user_prompt, self.gemini_api_key, max_tokens, True)
                return
            elif provider == "groq":
                if not self.groq_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.groq_api_key, self.groq_model, "https://api.groq.com/openai/v1", max_tokens)
                return
            elif provider == "nvidia":
                if not self.nvidia_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.nvidia_api_key, self.nvidia_model, self.nvidia_url, max_tokens)
                return
            elif provider == "freemodel":
                if not self.freemodel_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.freemodel_api_key, self.freemodel_model, self.freemodel_url, max_tokens)
                return
            elif provider == "openrouter":
                if not self.openrouter_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.openrouter_api_key, self.openrouter_model, self.openrouter_url, max_tokens)
                return
            elif provider == "cohere":
                if not self.cohere_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.cohere_api_key, self.cohere_model, self.cohere_url, max_tokens)
                return
            elif provider == "cloudflare":
                if not self.cloudflare_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.cloudflare_api_key, self.cloudflare_model, self.cloudflare_url, max_tokens)
                return
            elif provider == "cerebras":
                if not self.cerebras_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.cerebras_api_key, self.cerebras_model, self.cerebras_url, max_tokens)
                return
            elif provider == "deepseek":
                if not self.deepseek_api_key:
                    return
                yield from self._stream_deepseek(user_prompt, self.deepseek_api_key, max_tokens, False)
                return
            elif provider == "claude":
                if not self.claude_api_key:
                    return
                import anthropic
                client = anthropic.Anthropic(api_key=self.claude_api_key)
                sp = getattr(self._local, 'system_prompt_override', None) or self._get_system_prompt()
                with client.messages.stream(
                    model=self.claude_model,
                    max_tokens=max_tokens,
                    temperature=0.3,
                    system=sp,
                    messages=[{"role": "user", "content": user_prompt}],
                ) as stream:
                    for text in stream.text_stream:
                        yield text
                return
            elif provider == "local":
                yield from self._stream_local(user_prompt)
                return
            else:
                logger.warning(f"_stream_provider: unknown provider '{provider}'")
                return
        except Exception as e:
            logger.warning(f"_stream_provider: {provider} failed: {e}")
            return

    def _route_by_task_stream(self, task_type: str, user_prompt: str, max_tokens: int = 1024):
        """Stream through the same task-specific fallback chain as non-streaming calls."""
        task_type, _ = self._set_request_routing_context(
            task_type, getattr(self._local, "reasoning_mode", "fast")
        )
        primary = self._get_provider_for_task(task_type)
        if not primary:
            return

        providers = [primary, *self._get_fallback_chain(task_type)]
        attempted: set[str] = set()
        for provider in providers:
            if not provider or provider in attempted:
                continue
            attempted.add(provider)
            role = "primary" if provider == primary else "fallback"
            logger.info(
                f"task_routing_stream: {task_type} provider={provider} role={role}"
            )
            stream_gen = self._stream_provider(provider, user_prompt, max_tokens)
            if stream_gen is None:
                continue
            yielded = False
            for chunk in stream_gen:
                yielded = True
                yield chunk
            if yielded:
                return
            logger.warning(
                f"task_routing_stream: {task_type} provider={provider} failed or returned no content"
            )

        logger.info(f"task_routing_stream: {task_type} all task fallbacks failed")
        return
    @property
    def http_client(self):
        if self._http_client is None:
            import httpx
            self._http_client = httpx.Client(timeout=settings.provider_timeout)
        return self._http_client

    # ── System prompts ─────────────────────────────────────────

    def _get_system_prompt(self) -> str:
        override = getattr(self._local, "system_prompt_override", None)
        language = getattr(self._local, "language_instruction", "")
        if override:
            return override + chr(10) * 2 + language
        return build_system_prompt(
            lang="en" if "English" in language else "vi",
            reasoning_mode=getattr(self._local, "reasoning_mode", "fast"),
            strict_evidence=bool(getattr(self._local, "strict_evidence", False)),
        )
    def _get_external_system_prompt(self) -> str:
        if getattr(self._local, 'reasoning_mode', 'fast') == 'fast':
            return 'You are a knowledgeable AI assistant. Answer directly and concisely from your own knowledge. Do not expose internal reasoning, ask yourself questions, or use think tags. If you do not know, say that you lack enough information.'
        return 'You are a knowledgeable AI assistant with strong reasoning skills. Give a complete, accurate, detailed answer. Define key concepts, analyze important characteristics, provide practical examples, discuss advantages, disadvantages, and applications when relevant, and use clear Markdown structure.'

    def _get_local_system_prompt(self) -> str:
        override = getattr(self._local, 'system_prompt_override', None)
        if override:
            return override + chr(10) * 2 + getattr(self._local, 'language_instruction', '')
        return self._get_system_prompt()

    def generate(
        self,
        query: str,
        context_text: str,
        citations_meta: Optional[list[dict]] = None,
        reasoning_mode: str = "fast",
        task_type: str = "chat",
        strict_evidence: bool = False,
        use_cache: bool = True,
    ) -> GenerationResult:
        task_type, reasoning_mode = self._set_request_routing_context(task_type, reasoning_mode)
        self._local.language_instruction = get_language_instruction(query)
        self._local.strict_evidence = strict_evidence
        if context_text not in ("__EXTERNAL_KNOWLEDGE__", ""):
            context_text, detected = neutralize_untrusted_text(context_text)
            context_text = redact_sensitive_text(
                context_text,
                redact_email=bool(getattr(settings, "redact_metadata_for_cloud", True)),
            )
            if detected:
                logger.warning("RAG_SECURITY prompt injection pattern neutralized in context")
        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        if reasoning_mode in ("deep", "deep_plus", "deep+"):
            max_tokens = 4096

        if context_text not in ("__EXTERNAL_KNOWLEDGE__", ""):
            context_text, detected = neutralize_untrusted_text(context_text)
            context_text = redact_sensitive_text(
                context_text,
                redact_email=bool(getattr(settings, "redact_metadata_for_cloud", True)),
            )
            if detected:
                logger.warning("RAG_SECURITY prompt injection pattern neutralized in streaming context")

        if context_text not in ("__EXTERNAL_KNOWLEDGE__", "") and context_text.strip():
            context_text = self._trim_review_context(context_text, query, task_type, max_tokens)

        if context_text == "__EXTERNAL_KNOWLEDGE__":
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = query
        elif not context_text.strip() or len(context_text.strip()) < 50:
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = query
        else:
            self._local.system_prompt_override = None
            user_prompt = build_rag_user_prompt(context_text, query)

        from app_state import state
        from db.database import get_session
        from db.models import LLMCache

        system_prompt = self._get_system_prompt()
        key_hash = cache_fingerprint(
            model=f"route:{task_type}:{reasoning_mode}",
            provider=self.custom_cloud_provider or self.mode,
            prompt=(
                f"[task={task_type};reasoning={reasoning_mode};strict={int(strict_evidence)}]\n"
                + system_prompt + "\n\n" + user_prompt
            ),
            context=context_text,
        )

        if use_cache and state.engine:
            session = get_session(state.engine)
            try:
                cached = session.query(LLMCache).filter(LLMCache.key_hash == key_hash).first()
                if cached:
                    logger.info("Retrieving LLM response from local cache...")
                    cached_data = json.loads(cached.response)
                    session.close()
                    return GenerationResult(
                        content=cached_data["content"],
                        citations=cached_data["citations"],
                        model_used=cached_data["model_used"] + " (cached)",
                        finish_reason=cached_data.get("finish_reason", "stop"),
                        router_reason=cached_data.get("router_reason", "cache hit"),
                        router_token_count=cached_data.get("router_token_count", 0)
                    )
            except Exception as cache_err:
                logger.warning(f"Failed to query LLM cache: {cache_err}")
            finally:
                session.close()

        result = self._generate_uncached(query, context_text, citations_meta, max_tokens, task_type)

        if result and result.finish_reason != "error" and state.engine:
            session = get_session(state.engine)
            try:
                cached_res = {
                    "content": result.content,
                    "citations": result.citations,
                    "model_used": result.model_used,
                    "finish_reason": result.finish_reason,
                    "router_reason": result.router_reason,
                    "router_token_count": result.router_token_count
                }
                existing = session.query(LLMCache).filter(LLMCache.key_hash == key_hash).first()
                if existing:
                    existing.response = json.dumps(cached_res)
                else:
                    session.add(LLMCache(
                        key_hash=key_hash,
                        prompt=user_prompt,
                        response=json.dumps(cached_res)
                    ))
                session.commit()
            except Exception as cache_err:
                session.rollback()
                logger.warning(f"Failed to save to LLM cache: {cache_err}")
            finally:
                session.close()

        if result.finish_reason == "length":
            logger.warning(f"LLM response truncated (finish_reason=length) for task_type={task_type}, max_tokens={max_tokens}, content_len={len(result.content)}")

        if reasoning_mode == "fast" and result.content:
            from common.text_utils import clean_thinking_content
            result.content = clean_thinking_content(result.content)

        return result

    def _generate_uncached(
        self,
        query: str,
        context_text: str,
        citations_meta: Optional[list[dict]] = None,
        max_tokens: Optional[int] = None,
        task_type: str = "",
    ) -> GenerationResult:
        max_out = max_tokens or 1024
        if context_text not in ("__EXTERNAL_KNOWLEDGE__", "") and context_text.strip():
            context_text = self._trim_review_context(context_text, query, task_type, max_out)

        if context_text == "__EXTERNAL_KNOWLEDGE__":
            user_prompt = query
        elif not context_text.strip():
            user_prompt = query
        else:
            user_prompt = build_rag_user_prompt(context_text, query)

        import time

        if not getattr(settings, "cloud_ai_consent", True):
            logger.info("PRIVACY: cloud AI disabled; forcing local generation")
            return self._generate_local(user_prompt, max_tokens=max_out)

        # Per-task provider routing
        if task_type:
            routed = self._route_by_task(task_type, user_prompt, max_tokens or 1024)
            if routed is not None:
                return routed
            logger.info(f"task_routing: {task_type} fallback to default chain")

        # Default LLM Routing — use ultimate fallback chain from config
        if self.mode == "cloud_free":
            from concurrent.futures import ThreadPoolExecutor, TimeoutError

            chain = self.ultimate_fallback_chain or ["github", "gemini", "groq", "nvidia", "nvidia_deepseek", "local"]
            for provider in chain:
                if provider == "local":
                    logger.warning("All cloud_free providers failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)

                logger.info(f"cloud_free: trying {provider}...")
                t0 = time.time()
                pool = ThreadPoolExecutor(max_workers=1)
                fut = pool.submit(self._call_provider_with_retry, provider, user_prompt, max_tokens)
                try:
                    result = fut.result(timeout=8.0)
                except TimeoutError:
                    fut.cancel()
                    logger.warning(f"{provider} timed out (>8s), trying next...")
                    continue
                finally:
                    # A context manager waits for the timed-out thread and defeats
                    # provider failover. Do not block the request on shutdown.
                    pool.shutdown(wait=False, cancel_futures=True)

                elapsed = time.time() - t0
                if result is not None and result.finish_reason != "error":
                    logger.info(f"TIMING: {provider}={elapsed:.2f}s finish={result.finish_reason}")
                    return result
                logger.warning(f"{provider} failed (elapsed={elapsed:.1f}s), trying next...")

            logger.warning("All cloud_free providers failed. Falling back to local model...")
            return self._generate_local(
                self._fit_prompt(user_prompt, "local", max_tokens or 1024),
                max_tokens=max_tokens,
            )

        elif self.mode == "cloud_custom":
            provider = self.custom_cloud_provider
            user_prompt = self._fit_prompt(user_prompt, provider, max_tokens or 1024)
            if provider == "deepseek":
                if not self.deepseek_api_key:
                    return GenerationResult(
                        content="⚠️ No DeepSeek API key is configured. Open Settings and add an API key.",
                        citations=[], model_used="deepseek/no_key", finish_reason="no_key",
                    )
                result = self._generate_deepseek(user_prompt, self.deepseek_api_key, max_tokens, is_free=False)
                if result.finish_reason == "error":
                    logger.warning("Custom DeepSeek failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif provider == "gemini":
                if not self.gemini_api_key:
                    return GenerationResult(
                        content="⚠️ No Gemini API key is configured.",
                        citations=[], model_used="gemini/no_key", finish_reason="no_key",
                    )
                result = self._generate_gemini(user_prompt, self.gemini_api_key, max_tokens, is_free=False)
                if result.finish_reason == "error":
                    logger.warning("Custom Gemini failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif provider == "claude":
                if not self.claude_api_key:
                    return GenerationResult(
                        content="⚠️ No Claude API key is configured.",
                        citations=[], model_used="claude/no_key", finish_reason="no_key",
                    )
                result = self._generate_claude(user_prompt, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom Claude failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif provider == "groq":
                if not self.groq_api_key:
                    return GenerationResult(
                        content="⚠️ No Groq API key is configured.",
                        citations=[], model_used="groq/no_key", finish_reason="no_key",
                    )
                result = self._generate_groq(user_prompt, self.groq_api_key, self.groq_model, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom Groq failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif provider == "nvidia":
                if not self.nvidia_api_key:
                    return GenerationResult(
                        content="⚠️ No NVIDIA API key is configured.",
                        citations=[], model_used="nvidia/no_key", finish_reason="no_key",
                    )
                result = self._generate_nvidia(user_prompt, self.nvidia_api_key, self.nvidia_model, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom Nvidia failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif provider == "freemodel":
                if not self.freemodel_api_key:
                    return GenerationResult(
                        content="⚠️ No FreeModel API key is configured.",
                        citations=[], model_used="freemodel/no_key", finish_reason="no_key",
                    )
                result = self._generate_freemodel(user_prompt, self.freemodel_api_key, self.freemodel_model, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom FreeModel failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result

        return self._generate_local(
            self._fit_prompt(user_prompt, "local", max_tokens or 1024),
            max_tokens=max_tokens,
        )

    def generate_direct(
        self,
        user_prompt: str,
        system_prompt: str = "",
        max_tokens: int = 1024,
        task_type: str = "research",
    ) -> str:
        saved_override = getattr(self._local, 'system_prompt_override', None)
        base_system_prompt = system_prompt or saved_override or self._get_system_prompt()
        self._local.system_prompt_override = base_system_prompt + "\n\n" + get_language_instruction(user_prompt)
        try:
            result = self._generate_uncached(
                query=user_prompt, context_text="__EXTERNAL_KNOWLEDGE__",
                max_tokens=max_tokens, task_type=task_type,
            )
            return result.content if result else ""
        finally:
            self._local.system_prompt_override = saved_override

    async def generate_direct_async(
        self,
        user_prompt: str,
        system_prompt: str = "",
        max_tokens: int = 1024,
        task_type: str = "research",
    ) -> str:
        import asyncio
        return await asyncio.to_thread(
            self.generate_direct, user_prompt, system_prompt, max_tokens, task_type,
        )

    # ── Verify ─────────────────────────────────────────────────

    def _get_verify_system_prompt(self) -> str:
        return (
            "You are ResearchMind Academic Verifier. Produce a STRUCTURED ACADEMIC AUDIT REPORT, not a chatbot answer.\n\n"
            "## OUTPUT FORMAT (follow exactly)\n"
            "1. **ACADEMIC VERDICT** (1 line) \u2014 One of:\n"
            "   \u2705 **Supported** \u2014 Claim is well-supported by evidence\n"
            "   \u26a0\ufe0f **Partially Supported** \u2014 Some evidence exists but gaps remain\n"
            "   \u2753 **Inconclusive** \u2014 Cannot determine from available evidence\n"
            "   \u274c **Contradicted** \u2014 Evidence contradicts the claim\n"
            "2. **ACADEMIC BASIS** \u2014 What rules and methods were used:\n"
            "   - Rules applied: (e.g. evidence_grounding, citation_integrity)\n"
            "   - Verification method: (e.g. DOI resolution, Crossref lookup, format audit)\n"
            "   - Standards used: (e.g. IEEE, ACM, APA, Crossref, OpenAlex)\n"
            "3. **EVIDENCE** \u2014 Bullet list with format:\n"
            "   - [Rule/Check]: [Finding] \u2014 [Source] \u2014 [Confidence: High/Medium/Low]\n"
            "4. **LIMITATIONS** \u2014 What could NOT be verified and why:\n"
            "   - Unverifiable items: (e.g. DOI not found in Crossref, no OpenAlex data)\n"
            "   - Missing data: (what additional information would help)\n"
            "   - Assumptions made: (any assumptions used during verification)\n"
            "5. **CONFIDENCE** \u2014 Overall confidence level: High / Medium / Low. Explain why.\n"
            "6. **NEXT STEPS** \u2014 Concrete actions the user should take.\n\n"
            "## CITATION RULES\n"
            "Cite local as [Paper title], OpenAlex as [OpenAlex: title], Crossref as [Crossref: DOI].\n\n"
            "## SOURCE HIERARCHY\n"
            "1. Local PDF content (most authoritative)\n"
            "2. Crossref metadata (DOI validation, journal)\n"
            "3. OpenAlex (citation count, related works)\n"
            "4. Semantic Scholar (influential citations)\n\n"
            "## RULES\n"
            "- NEVER ask the user to provide info already in the context.\n"
            "- NEVER say 'cannot find' without listing what WAS found.\n"
            "- If a DOI is found but unresolvable, state as 'Unresolved DOI'.\n"
            "- If no external data, verify only from local PDFs and state the limitation.\n"
            "- Every sentence must be grounded in the supplied context.\n"
            "- For every claim, state whether it is Supported, Partially Supported, Inconclusive, or Contradicted."
        )

    def generate_verify(
        self,
        query: str,
        context_text: str,
        external_data_text: str = "",
        citations_meta: Optional[list[dict]] = None,
        task_type: str = "verify",
        lang: str = "",
    ) -> GenerationResult:
        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        combined_context = context_text
        if external_data_text.strip():
            combined_context += (
                f"\n\n## EXTERNAL ACADEMIC DATA (OpenAlex + Crossref)\n{external_data_text}"
            )

        if not combined_context.strip():
            return GenerationResult(
                content="No data is available for verification. Select papers or enter a question.",
                citations=[], model_used="none", finish_reason="no_context",
            )

        user_prompt = (
            f"## Context from documents and external academic sources:\n{combined_context}\n\n"
            f"## Question:\n{query}\n\n"
            "Verify the research claims using the data above. "
            "Clearly distinguish local PDF evidence from OpenAlex and Crossref evidence."
        )

        system_prompt = self._get_verify_system_prompt() + "\n\n" + get_language_instruction(query)
        mode = self.mode

        if mode == "cloud_free":
            if self.github_api_key:
                result = self._generate_github(user_prompt, self.github_api_key, self.github_model, max_tokens, system_prompt_override=system_prompt)
                if result.finish_reason != "error":
                    return result
            if self.gemini_api_key:
                result = self._generate_gemini(user_prompt, self.gemini_api_key, max_tokens, is_free=True, system_prompt_override=system_prompt)
                if result.finish_reason != "error":
                    return result
            if self.groq_api_key:
                result = self._generate_groq(user_prompt, self.groq_api_key, self.groq_model, max_tokens, system_prompt_override=system_prompt)
                if result.finish_reason != "error":
                    return result
            if self.nvidia_api_key:
                result = self._generate_nvidia(user_prompt, self.nvidia_api_key, self.nvidia_model, max_tokens, system_prompt_override=system_prompt)
                if result.finish_reason != "error":
                    return result
                if self.nvidia_deepseek_api_key:
                    result = self._generate_nvidia(user_prompt, self.nvidia_deepseek_api_key, self.nvidia_deepseek_model, max_tokens, system_prompt_override=system_prompt)
                    if result.finish_reason != "error":
                        return result
            return self._generate_local(user_prompt, system_prompt_override=system_prompt)

        elif mode == "cloud_custom":
            provider = self.custom_cloud_provider
            if provider == "deepseek" and self.deepseek_api_key:
                result = self._generate_deepseek(user_prompt, self.deepseek_api_key, max_tokens, system_prompt_override=system_prompt)
                if result.finish_reason == "error":
                    logger.warning("Custom DeepSeek failed. Falling back to local model...")
                    return self._generate_local(user_prompt, system_prompt_override=system_prompt)
                return result
            if provider == "claude" and self.claude_api_key:
                result = self._generate_claude(user_prompt, max_tokens, system_prompt_override=system_prompt)
                if result.finish_reason == "error":
                    logger.warning("Custom Claude failed. Falling back to local model...")
                    return self._generate_local(user_prompt, system_prompt_override=system_prompt)
                return result
            if provider == "gemini" and self.gemini_api_key:
                result = self._generate_gemini(user_prompt, self.gemini_api_key, max_tokens, is_free=False, system_prompt_override=system_prompt)
                if result.finish_reason == "error":
                    logger.warning("Custom Gemini failed. Falling back to local model...")
                    return self._generate_local(user_prompt, system_prompt_override=system_prompt)
                return result
            return self._generate_local(user_prompt, system_prompt_override=system_prompt)

        return self._generate_local(user_prompt, system_prompt_override=system_prompt)

    # ── Helpers ────────────────────────────────────────────────

    @staticmethod
    def _apply_chat_template(system: str, user: str) -> str:
        return f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n"

    def _call_with_retry(self, fn, *args, max_retries=1, **kwargs):
        last_result = None
        for attempt in range(max_retries + 1):
            try:
                result = fn(*args, **kwargs)
                if result.finish_reason != "error":
                    return result
                last_result = result
                if attempt < max_retries:
                    logger.warning(f"Retry {attempt+1}/{max_retries} for {fn.__name__} (finish_reason={result.finish_reason})")
            except Exception as e:
                last_result = None
                if attempt < max_retries:
                    logger.warning(f"Retry {attempt+1}/{max_retries} for {fn.__name__}: {e}")
                else:
                    raise
        if last_result is not None:
            return last_result
        raise RuntimeError(f"All {max_retries+1} retries exhausted for {fn.__name__}")

    def _extract_citations(self, content: str) -> list[dict]:
        content = content or ""
        citations = []
        pattern = r'\[([^\]]+?)(?:,\s*(?:page|trang)\s*(\d+))?\]'
        for match in re.finditer(pattern, content):
            citations.append({
                "source": match.group(1).strip(),
                "page": int(match.group(2)) if match.group(2) else None,
                "text": match.group(0),
            })
        return citations

    def _verify_citations(self, content: str, citations: list[dict]) -> str:
        return content

    # ── Streaming ──────────────────────────────────────────────

    def stream_generate(
        self,
        query: str,
        context_text: str,
        reasoning_mode: str = "fast",
        task_type: str = "chat",
        strict_evidence: bool = False,
    ):
        task_type, reasoning_mode = self._set_request_routing_context(task_type, reasoning_mode)
        self._local.language_instruction = get_language_instruction(query)
        self._local.strict_evidence = strict_evidence
        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        if reasoning_mode in ("deep", "deep_plus", "deep+"):
            max_tokens = 4096

        if context_text not in ("__EXTERNAL_KNOWLEDGE__", "") and context_text.strip():
            context_text = self._trim_review_context(context_text, query, task_type, max_tokens)

        if context_text == "__EXTERNAL_KNOWLEDGE__":
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = f"Question: {query}\n\nAnswer the question naturally using your existing knowledge."
        elif not context_text.strip() or len(context_text.strip()) < 50:
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = query
        else:
            self._local.system_prompt_override = None
            user_prompt = (
                f"## Document context:\n{context_text}\n\n"
                f"## Question:\n{query}\n\n"
                "Answer using the context above when it contains relevant information. "
                "Cite every context-supported claim as [Paper title, page X] when a page is supplied, otherwise [Paper title]."
            )

        if not getattr(settings, "cloud_ai_consent", True):
            logger.info("PRIVACY: cloud AI disabled; forcing local stream")
            yield from self._stream_local(user_prompt)
            return
        yield from self._stream_chain(user_prompt, max_tokens, task_type)

    def stream_generate_verify(
        self,
        query: str,
        context_text: str,
        task_type: str = "verify",
        lang: str = "",
    ):
        if not context_text.strip() or len(context_text.strip()) < 50:
            yield "No relevant documents were found. Import a PDF or try a different question."
            return

        task_type, _ = self._set_request_routing_context(task_type, "fast")
        self._local.lang = lang
        self._local.strict_evidence = True
        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        previous_prompt = getattr(self._local, "system_prompt_override", None)
        self._local.system_prompt_override = self._get_verify_system_prompt() + "\n\n" + get_language_instruction(query)

        user_prompt = (
            f"## Context from documents and external academic sources:\n{context_text}\n\n"
            f"## Question:\n{query}\n\n"
            "Verify the research claims using the data above. "
            "Clearly distinguish local PDF evidence from OpenAlex and Crossref evidence."
        )

        try:
            yield from self._stream_chain(user_prompt, max_tokens, task_type)
        finally:
            self._local.system_prompt_override = previous_prompt

    def _set_model(self, model_str: str, token_count: int = 0) -> None:
        self.current_model = model_str
        self.current_token_count = token_count
        try:
            from ai.model_router import ModelRouter
            sel = ModelRouter(default_model=model_str)
            sel_result = sel.select_for_content("", task_type="chat")
            self.current_router_reason = sel_result.reason
        except Exception:
            self.current_router_reason = ""

    def _stream_chain(self, user_prompt: str, max_tokens: int = 1024, task_type: str = ""):
        self.current_router_reason = ""
        self.current_token_count = 0

        # Per-task provider routing (stream)
        if task_type:
            stream_gen = self._route_by_task_stream(task_type, user_prompt, max_tokens)
            if stream_gen is not None:
                yielded = False
                for chunk in stream_gen:
                    yielded = True
                    yield chunk
                if yielded:
                    return
                logger.info(f"task_routing_stream: {task_type} fallback to default chain")

        if self.mode == "cloud_free":
            chain = self.ultimate_fallback_chain or ["github", "gemini", "groq", "nvidia", "nvidia_deepseek", "local"]
            tried_any = False
            for provider in chain:
                if provider == "local":
                    self._set_model(f"local/{self.local_model}")
                    if tried_any:
                        yield "\n⚠️ All free cloud providers failed. Switching to the local model...\n"
                    fitted = self._fit_prompt(user_prompt, "local", max_tokens)
                    for chunk in self._stream_local(fitted):
                        yield chunk
                    return

                self._set_model(f"{provider}/...")
                yielded = False
                t0 = time.time()
                for chunk in self._stream_provider(provider, user_prompt, max_tokens):
                    if not yielded:
                        yielded = True
                        tried_any = True
                        elapsed = time.time() - t0
                        if elapsed > 3.0:
                            logger.warning(f"{provider} first chunk slow ({elapsed:.1f}s), but continuing")
                    yield chunk
                if yielded:
                    return
                logger.info(f"{provider} failed/skipped, trying next...")

            # Last resort
            self._set_model(f"local/{self.local_model}")
            yield "\n⚠️ No provider is available. Switching to the local model...\n"
            fitted = self._fit_prompt(user_prompt, "local", max_tokens)
            for chunk in self._stream_local(fitted):
                yield chunk

        elif self.mode == "cloud_custom":
            provider = self.custom_cloud_provider
            user_prompt = self._fit_prompt(user_prompt, provider, max_tokens)
            if provider == "deepseek":
                if not self.deepseek_api_key:
                    self._set_model("deepseek/no_key")
                    yield "⚠️ No DeepSeek API key is configured."
                    return
                self._set_model(f"deepseek/{self.deepseek_model}")
                for chunk in self._stream_deepseek(user_prompt, self.deepseek_api_key, max_tokens, is_free=False):
                    yield chunk
            elif provider == "gemini":
                if not self.gemini_api_key:
                    self._set_model("gemini/no_key")
                    yield "⚠️ No Gemini API key is configured."
                    return
                self._set_model(f"gemini/{self.gemini_model}")
                for chunk in self._stream_gemini(user_prompt, self.gemini_api_key, max_tokens, is_free=False):
                    yield chunk
            elif provider == "claude":
                if not self.claude_api_key:
                    self._set_model("claude/no_key")
                    yield "⚠️ No Claude API key is configured."
                    return
                self._set_model(f"claude/{self.claude_model}")
                try:
                    import anthropic
                    client = anthropic.Anthropic(api_key=self.claude_api_key)
                    with client.messages.stream(
                        model=self.claude_model, max_tokens=max_tokens, temperature=0.3,
                        system=self._get_system_prompt(),
                        messages=[{"role": "user", "content": user_prompt}],
                    ) as stream:
                        for text in stream.text_stream:
                            yield text
                except Exception as e:
                    self._set_model(f"local/{self.local_model}")
                    yield f"\n⚠️ Claude streaming failed: {str(e)}. Switching to the local model..."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            elif provider == "groq":
                if not self.groq_api_key:
                    self._set_model("groq/no_key")
                    yield "⚠️ No Groq API key is configured."
                    return
                self._set_model(f"groq/{self.groq_model}")
                try:
                    yield from self._stream_openai(user_prompt, self.groq_api_key, self.groq_model, "https://api.groq.com/openai/v1", max_tokens)
                except Exception as e:
                    self._set_model(f"local/{self.local_model}")
                    yield f"\n⚠️ Groq streaming failed: {str(e)}."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            elif provider == "nvidia":
                if not self.nvidia_api_key:
                    self._set_model("nvidia/no_key")
                    yield "⚠️ No NVIDIA API key is configured."
                    return
                self._set_model(f"nvidia/{self.nvidia_model}")
                try:
                    yield from self._stream_openai(user_prompt, self.nvidia_api_key, self.nvidia_model, self.nvidia_url, max_tokens)
                except Exception as e:
                    self._set_model(f"local/{self.local_model}")
                    yield f"\n⚠️ NVIDIA streaming failed: {str(e)}."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            elif provider == "freemodel":
                if not self.freemodel_api_key:
                    self._set_model("freemodel/no_key")
                    yield "⚠️ No FreeModel API key is configured."
                    return
                self._set_model(f"freemodel/{self.freemodel_model}")
                try:
                    yield from self._stream_openai(user_prompt, self.freemodel_api_key, self.freemodel_model, self.freemodel_url, max_tokens)
                except Exception as e:
                    self._set_model(f"local/{self.local_model}")
                    yield f"\n⚠️ FreeModel streaming failed: {str(e)}."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            else:
                self._set_model("unknown/invalid")
                yield "⚠️ Invalid cloud provider."

        else:
            self._set_model(f"local/{self.local_model}")
            fitted = self._fit_prompt(user_prompt, "local", max_tokens)
            for chunk in self._stream_local(fitted):
                yield chunk
