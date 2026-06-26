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
import httpx
from loguru import logger
from config.settings import settings
from common.text_utils import redact_api_key

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    import anthropic

from .types import GenerationResult
from .providers.openai_provider import OpenAIProviderMixin
from .providers.gemini_provider import GeminiProviderMixin
from .providers.claude_provider import ClaudeProviderMixin
from .providers.local_provider import LocalProviderMixin


class Generator(
    OpenAIProviderMixin,
    GeminiProviderMixin,
    ClaudeProviderMixin,
    LocalProviderMixin,
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
        github_model: str = "Phi-4-mini-instruct",
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
        cerebras_url: str = "https://api.cerebras.ai/v1",
        mode: str = "cloud_free",
        task_provider_map: Optional[str] = None,
        custom_cloud_provider: str = "deepseek",
        local_max_tokens: int = 160,
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

        # Per-task provider routing (Phase 1)
        self.task_provider_map: dict[str, str] = {}
        self._parse_task_provider_map(task_provider_map if task_provider_map is not None else settings.task_provider_map)

        # Per-task fallback provider (Phase 4A)
        self.task_fallback_map: dict[str, str] = {}
        self._parse_task_fallback_map(settings.task_fallback_map)

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
        "review": 1536,
        "critique": 1536,
        "debate": 2048,
        "gap": 1536,
        "quality_check": 1024,
        "preview": 384,
        "default": 1024,
    }

    # ── Routing helpers ────────────────────────────────────────

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
        
        # Dynamic routing for chat/rag tasks based on reasoning_mode
        if task_type in ("chat", "rag"):
            mode = getattr(self._local, "reasoning_mode", "fast")
            if mode == "fast":
                return "github"
            elif mode == "deep":
                return "openrouter"
            elif mode in ("deep_plus", "deep+"):
                return "openrouter_r1"

        # Heavy analytical tasks → DeepSeek-V3-0324 via GitHub Models
        if task_type in ("critique", "debate", "insight", "gap"):
            if self.github_deepseek_v3_api_key:
                return "github_deepseek_v3"
            logger.warning(f"github_deepseek_v3_api_key empty, falling back to task_provider_map for {task_type}")

        # Quality check → Groq (fastest inference, llama-3.3-70b-instant ~100 tok/s)
        # GitHub Phi-4-mini-instruct is too slow for this analytical task
        if task_type == "quality_check":
            if self.groq_api_key:
                return "groq"
            # Skip task_provider_map — GitHub times out for quality_check
            return None

        return self.task_provider_map.get(task_type)

    def _get_fallback_for_task(self, task_type: str) -> str | None:
        task_type = task_type.strip().lower() if task_type else ""
        if not task_type:
            return None
            
        # Dynamic routing for chat/rag tasks based on reasoning_mode
        if task_type in ("chat", "rag"):
            mode = getattr(self._local, "reasoning_mode", "fast")
            if mode == "fast":
                return "openrouter"
            elif mode == "deep":
                return "gemini"
            elif mode in ("deep_plus", "deep+"):
                return "gemini"
                
        return self.task_fallback_map.get(task_type)

    def _get_fallback_chain(self, task_type: str) -> list[str]:
        """Get ordered fallback chain for a task.
        Returns list of providers to try in sequence after primary fails.
        """
        chain: list[str] = []
        task_type = task_type.strip().lower() if task_type else ""
        if not task_type:
            return chain

        # Quality check: try fast providers in priority order
        if task_type == "quality_check":
            for p, key_attr in [
                ("cerebras", "cerebras_api_key"),
                ("freemodel", "freemodel_api_key"),
                ("gemini", "gemini_api_key"),
                ("nvidia", "nvidia_api_key"),
                ("cloudflare", "cloudflare_api_key"),
                ("cohere", "cohere_api_key"),
            ]:
                if getattr(self, key_attr, None):
                    chain.append(p)

        # Also include the task_fallback_map entry if not already in chain
        fb = self._get_fallback_for_task(task_type)
        if fb and fb not in chain:
            chain.append(fb)

        return chain

    # ── Non-streaming provider dispatch ────────────────────────

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
        try:
            if provider == "github":
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
            logger.warning(f"_call_provider: {provider} failed: {e}")
            return None

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
        provider = self._get_provider_for_task(task_type)
        if not provider:
            return None

        logger.info(f"task_routing: {task_type} → {provider} (primary)")
        result = self._call_provider(provider, user_prompt, max_tokens, system_prompt_override)
        if result is not None and result.finish_reason != "error":
            return result

        # Try fallback chain (primary → fb1 → fb2 → ... → default chain)
        fallbacks = self._get_fallback_chain(task_type)
        for fb in fallbacks:
            if fb == provider:
                continue
            logger.info(f"task_routing: {task_type} primary={provider} failed, trying fallback={fb}")
            result = self._call_provider(fb, user_prompt, max_tokens, system_prompt_override)
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
        try:
            if provider == "github":
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
        """Streaming version of _route_by_task.
        Tries primary first, then fallback, then returns (no yield = use chain).
        """
        provider = self._get_provider_for_task(task_type)
        if not provider:
            return

        # Try primary provider
        logger.info(f"task_routing_stream: {task_type} → {provider} (primary)")
        stream_gen = self._stream_provider(provider, user_prompt, max_tokens)
        if stream_gen is not None:
            yielded = False
            for chunk in stream_gen:
                yielded = True
                yield chunk
            if yielded:
                return

        # Try fallback provider
        fallback = self._get_fallback_for_task(task_type)
        if fallback and fallback != provider:
            logger.info(f"task_routing_stream: {task_type} primary={provider} failed, trying fallback={fallback}")
            stream_gen = self._stream_provider(fallback, user_prompt, max_tokens)
            if stream_gen is not None:
                yielded = False
                for chunk in stream_gen:
                    yielded = True
                    yield chunk
                if yielded:
                    return
            logger.warning(f"task_routing_stream: {task_type} fallback={fallback} also failed")
        else:
            logger.info(f"task_routing_stream: {task_type} primary={provider} failed, no fallback")

        return  # all fail → use default chain

    # ── HTTP client ────────────────────────────────────────────

    @property
    def http_client(self):
        if self._http_client is None:
            import httpx
            self._http_client = httpx.Client(timeout=settings.provider_timeout)
        return self._http_client

    # ── System prompts ─────────────────────────────────────────

    def _get_system_prompt(self) -> str:
        override = getattr(self._local, 'system_prompt_override', None)
        if override:
            return override
        fast_rule = ""
        is_fast = getattr(self._local, 'reasoning_mode', 'fast') == "fast"
        if is_fast:
            fast_rule = """
5. ⚡ **Trả lời trực tiếp, không suy luận.** KHÔNG được tự đặt câu hỏi, KHÔNG suy nghĩ nội bộ. Chỉ đưa ra câu trả lời cuối cùng ngay lập tức."""
        
        detail_rule = "4. Giữ câu trả lời súc tích, học thuật, có cấu trúc rõ ràng."
        if not is_fast:
            detail_rule = "4. Hãy giải thích chi tiết, đầy đủ và có chiều sâu dựa trên tài liệu được cung cấp. Phân tích cặn kẽ và trình bày mạch lạc bằng các đầu mục, bảng biểu hoặc so sánh để người đọc dễ hiểu."

        return (
            "Bạn là trợ lý nghiên cứu AI. Nhiệm vụ của bạn là trả lời câu hỏi dựa trên các tài liệu được cung cấp nếu có.\n\n"
            "## QUY TẮC NGÔN NGỮ (QUAN TRỌNG):\n"
            "- Luôn trả lời bằng TIẾNG VIỆT. Tuyệt đối KHÔNG dùng tiếng Trung Quốc.\n"
            "- Nếu câu hỏi bằng tiếng Anh, trả lời bằng tiếng Anh.\n"
            "- KHÔNG bao gồm bất kỳ ký tự Trung Quốc nào trong câu trả lời.\n\n"
            "## QUY TẮC ĐỊNH DẠNG:\n"
            "- Dùng **in đậm** cho tiêu đề, tên cột, điểm số.\n"
            "- Dùng `mã code` cho ID, mã số.\n"
            "- Bảng: dùng markdown | cột1 | cột2 |.\n"
            "- Danh sách: dùng - hoặc 1. 2. 3.\n"
            "- Tách section rõ ràng bằng ## và ---.\n\n"
            "## QUY TẮC NỘI DUNG:\n"
            "1. Ưu tiên trả lời dựa trên thông tin trong context được cung cấp.\n"
            "2. Nếu thông tin trong context có liên quan, PHẢI trích dẫn nguồn: [Tên Paper] hoặc [Tên Paper, trang X].\n"
            "3. Nếu context không có thông tin liên quan đến câu hỏi, bạn có thể dùng kiến thức chung của mình để trả lời và ghi rõ \"(kiến thức chung)\" ở cuối.\n"
            + detail_rule + fast_rule
        )

    def _get_system_prompt_disabled(self) -> str:
        override = getattr(self._local, 'system_prompt_override', None)
        if override:
            return override
        fast_rule = ""
        if getattr(self._local, 'reasoning_mode', 'fast') == "fast":
            fast_rule = """
5. \u26a1 **Tr\u1ea3 l\u1eddi tr\u1ef1c ti\u1ebfp, kh\u00f4ng suy lu\u1eadn.** KH\u00d4NG \u0111\u01b0\u1ee3c t\u1ef1 \u0111\u1eb7t c\u00e2u h\u1ecfi, KH\u00d4NG suy ngh\u0129 n\u1ed9i b\u1ed9. Ch\u1ec9 \u0111\u01b0a ra c\u00e2u tr\u1ea3 l\u1eddi cu\u1ed1i c\u00f9ng ngay l\u1eadp t\u1ee9c."""
        return (
            "B\u1ea1n l\u00e0 tr\u1ee3 l\u00fd nghi\u00ean c\u1ee9u AI. Nhi\u1ec7m v\u1ee5 c\u1ee7a b\u1ea1n l\u00e0 tr\u1ea3 l\u1eddi c\u00e2u h\u1ecfi d\u1ef1a tr\u00ean c\u00e1c t\u00e0i li\u1ec7u \u0111\u01b0\u1ee3c cung c\u1ea5p n\u1ebfu c\u00f3.\n\n"
            "## QUY T\u1eaeC NG\u00d4N NG\u1eee (QUAN TR\u1eccNG):\n"
            "- Lu\u00f4n tr\u1ea3 l\u1eddi b\u1eb1ng TI\u1ebeNG VI\u1ec6T. Tuy\u1ec7t \u0111\u1ed1i KH\u00d4NG d\u00f9ng ti\u1ebfng Trung Qu\u1ed1c.\n"
            "- N\u1ebfu c\u00e2u h\u1ecfi b\u1eb1ng ti\u1ebfng Anh, tr\u1ea3 l\u1eddi b\u1eb1ng ti\u1ebfng Anh.\n"
            "- KH\u00d4NG bao g\u1ed3m b\u1ea5t k\u1ef3 k\u00fd t\u1ef1 Trung Qu\u1ed1c n\u00e0o trong c\u00e2u tr\u1ea3 l\u1eddi.\n\n"
            "## QUY T\u1eaeC \u0110\u1ecaNH D\u1ea0NG:\n"
            "- D\u00f9ng **in \u0111\u1eadm** cho ti\u00eau \u0111\u1ec1, t\u00ean c\u1ed9t, \u0111i\u1ec3m s\u1ed1.\n"
            "- D\u00f9ng `m\u00e3 code` cho ID, m\u00e3 s\u1ed1.\n"
            "- B\u1ea3ng: d\u00f9ng markdown | c\u1ed9t1 | c\u1ed9t2 |.\n"
            "- Danh s\u00e1ch: d\u00f9ng - ho\u1eb7c 1. 2. 3.\n"
            "- T\u00e1ch section r\u00f5 r\u00e0ng b\u1eb1ng ## v\u00e0 ---.\n\n"
            "## QUY T\u1eaeC N\u1ed8I DUNG:\n"
            "1. \u01afu ti\u00ean tr\u1ea3 l\u1eddi d\u1ef1a tr\u00ean th\u00f4ng tin trong context \u0111\u01b0\u1ee3c cung c\u1ea5p.\n"
            "2. N\u1ebfu th\u00f4ng tin trong context c\u00f3 li\u00ean quan, PH\u1ea2I tr\u00edch d\u1eabn ngu\u1ed3n: [T\u00ean Paper] ho\u1eb7c [T\u00ean Paper, trang X].\n"
            "3. N\u1ebfu context kh\u00f4ng c\u00f3 th\u00f4ng tin li\u00ean quan \u0111\u1ebfn c\u00e2u h\u1ecfi, b\u1ea1n c\u00f3 th\u1ec3 d\u00f9ng ki\u1ebfn th\u1ee9c chung c\u1ee7a m\u00ecnh \u0111\u1ec3 tr\u1ea3 l\u1eddi v\u00e0 ghi r\u00f5 \"(ki\u1ebfn th\u1ee9c chung)\" \u1edf cu\u1ed1i.\n"
            "4. Gi\u1eef c\u00e2u tr\u1ea3 l\u1eddi s\u00fac t\u00edch, h\u1ecdc thu\u1eadt, c\u00f3 c\u1ea5u tr\u00fac r\u00f5 r\u00e0ng." + fast_rule
        )

    def _get_external_system_prompt(self) -> str:
        is_fast = getattr(self._local, 'reasoning_mode', 'fast') == "fast"
        if is_fast:
            return (
                "Bạn là trợ lý AI thông thái. Trả lời ngắn gọn, trực tiếp, KHÔNG suy luận hay giải thích dài dòng.\n\n"
                "## QUY TẮC NGÔN NGỮ:\n"
                "- Luôn trả lời bằng TIẾNG VIỆT. Tuyệt đối KHÔNG dùng tiếng Trung Quốc.\n"
                "- Nếu câu hỏi bằng tiếng Anh, trả lời bằng tiếng Anh.\n"
                "- KHÔNG bao gồm bất kỳ ký tự Trung Quốc nào.\n\n"
                "## QUY TẮC NỘI DUNG:\n"
                "1. Trả lời thoải mái dựa trên kiến thức của bạn, KHÔNG cần tìm kiếm hay trích dẫn tài liệu.\n"
                "2. KHÔNG suy luận nội bộ, KHÔNG đặt câu hỏi, KHÔNG dùng thẻ <think>.\n"
                "3. Nếu không biết, nói thẳng \"Tôi không có đủ thông tin.\"\n"
                "4. Giữ câu trả lời súc tích, đúng trọng tâm."
            )
        else:
            return (
                "Bạn là trợ lý AI thông thái, có kiến thức sâu rộng và năng lực lập luận xuất sắc. Hãy trả lời câu hỏi một cách đầy đủ, chính xác, chi tiết và có chiều sâu.\n\n"
                "## QUY TẮC NGÔN NGỮ:\n"
                "- Luôn trả lời bằng TIẾNG VIỆT. Tuyệt đối KHÔNG dùng tiếng Trung Quốc.\n"
                "- Nếu câu hỏi bằng tiếng Anh, trả lời bằng tiếng Anh.\n"
                "- KHÔNG bao gồm bất kỳ ký tự Trung Quốc nào trong câu trả lời.\n\n"
                "## QUY TẮC NỘI DUNG & TRÌNH BÀY:\n"
                "1. Trình bày thông tin một cách chi tiết, toàn diện. Tránh trả lời quá ngắn gọn hoặc sơ sài.\n"
                "2. Cung cấp định nghĩa rõ ràng, phân tích các đặc điểm, đưa ra ví dụ minh họa thực tế, nêu ưu/nhược điểm và ứng dụng (nếu có).\n"
                "3. Sử dụng định dạng Markdown phong phú (in đậm, danh sách gạch đầu dòng, bảng so sánh, hoặc khối code) để câu trả lời có cấu trúc mạch mạch, chuyên nghiệp và dễ theo dõi.\n"
                "4. Hãy suy luận và lập luận một cách logic để giải quyết triệt để yêu cầu của người dùng."
            )

    def _get_local_system_prompt(self) -> str:
        if getattr(self._local, 'system_prompt_override', None):
            return self._local.system_prompt_override
        fast_rule = ""
        is_fast = getattr(self._local, 'reasoning_mode', 'fast') == "fast"
        if is_fast:
            fast_rule = "\n6. ⚡ **Trả lời trực tiếp, không suy luận.** KHÔNG được tự đặt câu hỏi, KHÔNG suy nghĩ nội bộ. Chỉ đưa ra câu trả lời cuối cùng ngay lập tức."
        
        detail_rule = "5. Giữ câu trả lời súc tích, học thuật, có cấu trúc rõ ràng."
        if not is_fast:
            detail_rule = "5. Hãy giải thích chi tiết, đầy đủ và có chiều sâu dựa trên tài liệu được cung cấp. Phân tích cặn kẽ và trình bày mạch lạc bằng các đầu mục, bảng biểu hoặc so sánh để người đọc dễ hiểu."

        return (
            "Bạn là trợ lý nghiên cứu AI. Nhiệm vụ của bạn là trả lời câu hỏi dựa trên các tài liệu được cung cấp nếu có.\n\n"
            "## QUY TẮC NGÔN NGỮ:\n"
            "- Luôn trả lời bằng TIẾNG VIỆT. Tuyệt đối KHÔNG dùng tiếng Trung Quốc.\n"
            "- Nếu câu hỏi bằng tiếng Anh, trả lời bằng tiếng Anh.\n\n"
            "## QUY TẮC NỘI DUNG:\n"
            "1. Ưu tiên trả lời dựa trên thông tin trong context được cung cấp.\n"
            "2. Nếu thông tin trong context có liên quan, PHẢI trích dẫn nguồn: [Tên Paper] hoặc [Tên Paper, trang X].\n"
            "3. Nếu context không có thông tin liên quan đến câu hỏi, bạn có thể dùng kiến thức chung của mình để trả lời và ghi rõ \"(kiến thức chung)\" ở cuối.\n"
            "4. Với câu chào hỏi thông thường, hãy trả lời tự nhiên như một trợ lý thân thiện.\n"
            + detail_rule + fast_rule
        )

    def _get_local_system_prompt_disabled(self) -> str:
        if getattr(self._local, 'system_prompt_override', None):
            return self._local.system_prompt_override
        fast_rule = ""
        if getattr(self._local, 'reasoning_mode', 'fast') == "fast":
            fast_rule = "\n6. \u26a1 **Tr\u1ea3 l\u1eddi tr\u1ef1c ti\u1ebfp, kh\u00f4ng suy lu\u1eadn.** KH\u00d4NG \u0111\u01b0\u1ee3c t\u1ef1 \u0111\u1eb7t c\u00e2u h\u1ecfi, KH\u00d4NG suy ngh\u0129 n\u1ed9i b\u1ed9. Ch\u1ec9 \u0111\u01b0a ra c\u00e2u tr\u1ea3 l\u1eddi cu\u1ed1i c\u00f9ng ngay l\u1eadp t\u1ee9c."
        return (
            "B\u1ea1n l\u00e0 tr\u1ee3 l\u00fd nghi\u00ean c\u1ee9u AI. Nhi\u1ec7m v\u1ee5 c\u1ee7a b\u1ea1n l\u00e0 tr\u1ea3 l\u1eddi c\u00e2u h\u1ecfi d\u1ef1a tr\u00ean c\u00e1c t\u00e0i li\u1ec7u \u0111\u01b0\u1ee3c cung c\u1ea5p n\u1ebfu c\u00f3.\n\n"
            "## QUY T\u1eaeC NG\u00d4N NG\u1eee:\n"
            "- Lu\u00f4n tr\u1ea3 l\u1eddi b\u1eb1ng TI\u1ebeNG VI\u1ec6T. Tuy\u1ec7t \u0111\u1ed1i KH\u00d4NG d\u00f9ng ti\u1ebfng Trung Qu\u1ed1c.\n"
            "- N\u1ebfu c\u00e2u h\u1ecfi b\u1eb1ng ti\u1ebfng Anh, tr\u1ea3 l\u1eddi b\u1eb1ng ti\u1ebfng Anh.\n\n"
            "## QUY T\u1eaeC N\u1ed8I DUNG:\n"
            "1. \u01afu ti\u00ean tr\u1ea3 l\u1eddi d\u1ef1a tr\u00ean th\u00f4ng tin trong context \u0111\u01b0\u1ee3c cung c\u1ea5p.\n"
            "2. N\u1ebfu th\u00f4ng tin trong context c\u00f3 li\u00ean quan, PH\u1ea2I tr\u00edch d\u1eabn ngu\u1ed3n: [T\u00ean Paper] ho\u1eb7c [T\u00ean Paper, trang X].\n"
            "3. N\u1ebfu context kh\u00f4ng c\u00f3 th\u00f4ng tin li\u00ean quan \u0111\u1ebfn c\u00e2u h\u1ecfi, b\u1ea1n c\u00f3 th\u1ec3 d\u00f9ng ki\u1ebfn th\u1ee9c chung c\u1ee7a m\u00ecnh \u0111\u1ec3 tr\u1ea3 l\u1eddi v\u00e0 ghi r\u00f5 \"(ki\u1ebfn th\u1ee9c chung)\" \u1edf cu\u1ed1i.\n"
            "4. V\u1edbi c\u00e2u ch\u00e0o h\u1ecfi th\u00f4ng th\u01b0\u1eddng, h\u00e3y tr\u1ea3 l\u1eddi t\u1ef1 nhi\u00ean nh\u01b0 m\u1ed9t tr\u1ee3 l\u00fd th\u00e2n thi\u1ec7n.\n"
            "5. Gi\u1eef c\u00e2u tr\u1ea3 l\u1eddi s\u00fac t\u00edch, h\u1ecdc thu\u1eadt, c\u00f3 c\u1ea5u tr\u00fac r\u00f5 r\u00e0ng." + fast_rule
        )

    # ── Main generate methods ──────────────────────────────────

    def generate(
        self,
        query: str,
        context_text: str,
        citations_meta: Optional[list[dict]] = None,
        reasoning_mode: str = "fast",
        task_type: str = "chat",
    ) -> GenerationResult:
        self._local.reasoning_mode = reasoning_mode
        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        if reasoning_mode in ("deep", "deep_plus", "deep+"):
            max_tokens = 4096

        if context_text == "__EXTERNAL_KNOWLEDGE__":
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = query
        elif not context_text.strip() or len(context_text.strip()) < 50:
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = query
        else:
            self._local.system_prompt_override = None
            user_prompt = (
                f"## Context từ tài liệu:\n{context_text}\n\n"
                f"## Câu hỏi:\n{query}\n\n"
                "Trả lời dựa trên context trên (nếu có thông tin liên quan). "
                "Nhớ trích dẫn nguồn [Tên Paper] cho mỗi thông tin bạn đưa ra."
            )

        import hashlib
        from app_state import state
        from db.database import get_session
        from db.models import LLMCache

        system_prompt = self._get_system_prompt()
        cache_key_raw = f"mode:{self.mode}|provider:{self.custom_cloud_provider}|sys:{system_prompt}|user:{user_prompt}"
        key_hash = hashlib.md5(cache_key_raw.encode("utf-8")).hexdigest()

        if state.engine:
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
                        finish_reason=cached_data.get("finish_reason", "stop")
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
                    "finish_reason": result.finish_reason
                }
                exists = session.query(LLMCache).filter(LLMCache.key_hash == key_hash).first()
                if not exists:
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
        if context_text == "__EXTERNAL_KNOWLEDGE__":
            user_prompt = query
        elif not context_text.strip():
            user_prompt = query
        else:
            user_prompt = (
                f"## Context t\u1eeb t\u00e0i li\u1ec7u:\n{context_text}\n\n"
                f"## C\u00e2u h\u1ecfi:\n{query}\n\n"
                "Tr\u1ea3 l\u1eddi d\u1ef1a tr\u00ean context tr\u00ean (n\u1ebfu c\u00f3 th\u00f4ng tin li\u00ean quan). "
                "Nh\u1edb tr\u00edch d\u1eabn ngu\u1ed3n [T\u00ean Paper] cho m\u1ed7i th\u00f4ng tin b\u1ea1n \u0111\u01b0a ra."
            )

        import time

        # Per-task provider routing
        if task_type:
            routed = self._route_by_task(task_type, user_prompt, max_tokens or 1024)
            if routed is not None:
                return routed
            logger.info(f"task_routing: {task_type} fallback to default chain")

        # Default LLM Routing
        if self.mode == "cloud_free":
            if self.github_api_key:
                logger.info("cloud_free: trying GitHub Models...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_github, user_prompt, self.github_api_key, self.github_model, max_tokens)
                logger.info(f"TIMING: GitHub Models={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"GitHub Models failed ({result.finish_reason}), trying Gemini...")
            if self.gemini_api_key:
                logger.info("cloud_free: trying Gemini...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_gemini, user_prompt, self.gemini_api_key, max_tokens, is_free=True)
                logger.info(f"TIMING: Gemini={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"Gemini failed ({result.finish_reason}), trying Groq...")
            if self.groq_api_key:
                logger.info("cloud_free: trying Groq...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_groq, user_prompt, self.groq_api_key, self.groq_model, max_tokens)
                logger.info(f"TIMING: Groq={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"Groq failed ({result.finish_reason}), trying NVIDIA NIM...")
            if self.nvidia_api_key:
                logger.info("cloud_free: trying NVIDIA NIM Kimi...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_nvidia, user_prompt, self.nvidia_api_key, self.nvidia_model, max_tokens, max_retries=0)
                logger.info(f"TIMING: NVIDIA Kimi={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"NVIDIA Kimi failed ({result.finish_reason}), trying NVIDIA NIM DeepSeek...")
                if self.nvidia_deepseek_api_key:
                    logger.info("cloud_free: trying NVIDIA NIM DeepSeek...")
                    t0 = time.time()
                    result = self._call_with_retry(self._generate_nvidia, user_prompt, self.nvidia_deepseek_api_key, self.nvidia_deepseek_model, max_tokens, max_retries=0)
                    logger.info(f"TIMING: NVIDIA DeepSeek={time.time()-t0:.2f}s finish={result.finish_reason}")
                    if result.finish_reason != "error":
                        return result
                logger.warning("NVIDIA failed.")
            logger.warning("All cloud_free providers failed. Falling back to local model...")
            return self._generate_local(user_prompt, max_tokens=max_tokens)

        elif self.mode == "cloud_custom":
            if self.custom_cloud_provider == "deepseek":
                if not self.deepseek_api_key:
                    return GenerationResult(
                        content="\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp DeepSeek API Key. H\u00e3y m\u1edf ph\u1ea7n C\u00e0i \u0111\u1eb7t v\u00e0 c\u1eadp nh\u1eadt API Key \u0111\u1ec3 s\u1eed d\u1ee5ng.",
                        citations=[], model_used="deepseek/no_key", finish_reason="no_key",
                    )
                result = self._generate_deepseek(user_prompt, self.deepseek_api_key, max_tokens, is_free=False)
                if result.finish_reason == "error":
                    logger.warning("Custom DeepSeek failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif self.custom_cloud_provider == "gemini":
                if not self.gemini_api_key:
                    return GenerationResult(
                        content="\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Gemini API Key.",
                        citations=[], model_used="gemini/no_key", finish_reason="no_key",
                    )
                result = self._generate_gemini(user_prompt, self.gemini_api_key, max_tokens, is_free=False)
                if result.finish_reason == "error":
                    logger.warning("Custom Gemini failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif self.custom_cloud_provider == "claude":
                if not self.claude_api_key:
                    return GenerationResult(
                        content="\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Claude API Key.",
                        citations=[], model_used="claude/no_key", finish_reason="no_key",
                    )
                result = self._generate_claude(user_prompt, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom Claude failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif self.custom_cloud_provider == "groq":
                if not self.groq_api_key:
                    return GenerationResult(
                        content="\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Groq API Key.",
                        citations=[], model_used="groq/no_key", finish_reason="no_key",
                    )
                result = self._generate_groq(user_prompt, self.groq_api_key, self.groq_model, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom Groq failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif self.custom_cloud_provider == "nvidia":
                if not self.nvidia_api_key:
                    return GenerationResult(
                        content="\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Nvidia API Key.",
                        citations=[], model_used="nvidia/no_key", finish_reason="no_key",
                    )
                result = self._generate_nvidia(user_prompt, self.nvidia_api_key, self.nvidia_model, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom Nvidia failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result
            elif self.custom_cloud_provider == "freemodel":
                if not self.freemodel_api_key:
                    return GenerationResult(
                        content="\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp FreeModel API Key.",
                        citations=[], model_used="freemodel/no_key", finish_reason="no_key",
                    )
                result = self._generate_freemodel(user_prompt, self.freemodel_api_key, self.freemodel_model, max_tokens)
                if result.finish_reason == "error":
                    logger.warning("Custom FreeModel failed. Falling back to local model...")
                    return self._generate_local(user_prompt, max_tokens=max_tokens)
                return result

        return self._generate_local(user_prompt, max_tokens=max_tokens)

    def generate_direct(
        self,
        user_prompt: str,
        system_prompt: str = "",
        max_tokens: int = 1024,
        task_type: str = "research",
    ) -> str:
        saved_override = getattr(self, '_system_prompt_override', None)
        self._system_prompt_override = system_prompt or saved_override or self._get_system_prompt()
        try:
            result = self._generate_uncached(
                query=user_prompt, context_text="__EXTERNAL_KNOWLEDGE__",
                max_tokens=max_tokens, task_type=task_type,
            )
            return result.content if result else ""
        finally:
            self._system_prompt_override = saved_override

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
            "B\u1ea1n l\u00e0 chuy\u00ean gia x\u00e1c th\u1ef1c nghi\u00ean c\u1ee9u h\u1ecdc thu\u1eadt. "
            "Ki\u1ec3m ch\u1ee9ng tuy\u00ean b\u1ed1 t\u1eeb LOCAL PDF v\u00e0 ngu\u1ed3n NGO\u00c0I (OpenAlex, Crossref).\n\n"
            "Tr\u00edch d\u1eabn: [T\u00ean Paper] cho local, [OpenAlex: T\u00ean Paper] cho OpenAlex, [Crossref: DOI] cho Crossref.\n\n"
            "Ph\u00e2n bi\u1ec7t r\u00f5 ngu\u1ed3n local v\u00e0 b\u00ean ngo\u00e0i. "
            "Khi c\u00f3 d\u1eef li\u1ec7u ngo\u00e0i, hi\u1ec3n th\u1ecb: s\u1ed1 tr\u00edch d\u1eabn, paper tr\u00edch d\u1eabn g\u1ea7n \u0111\u00e2y, nghi\u00ean c\u1ee9u li\u00ean quan, DOI verification.\n\n"
            "So s\u00e1nh k\u1ebft lu\u1eadn: h\u1ed7 tr\u1ee3 \u2705 / m\u00e2u thu\u1eabn \u26a0\ufe0f / c\u1ea7n th\u00eam b\u1eb1ng ch\u1ee9ng \u2753\n\n"
            "N\u1ebfu kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u ngo\u00e0i: ch\u1ec9 d\u00f9ng local PDF. "
            "N\u1ebfu kh\u00f4ng \u0111\u1ee7: b\u00e1o kh\u00f4ng t\u00ecm th\u1ea5y. "
            "Tr\u1ea3 l\u1eddi ti\u1ebfng Vi\u1ec7t, c\u1ea5u tr\u00fac r\u00f5 r\u00e0ng."
        )

    def generate_verify(
        self,
        query: str,
        context_text: str,
        external_data_text: str = "",
        citations_meta: Optional[list[dict]] = None,
        task_type: str = "verify",
    ) -> GenerationResult:
        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        combined_context = context_text
        if external_data_text.strip():
            combined_context += (
                f"\n\n## D\u1eee LI\u1ec6U H\u1eccC THU\u1eacT B\u00caN NGO\u00c0I (OpenAlex + Crossref)\n{external_data_text}"
            )

        if not combined_context.strip():
            return GenerationResult(
                content="Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u \u0111\u1ec3 x\u00e1c th\u1ef1c. Vui l\u00f2ng ch\u1ecdn paper ho\u1eb7c nh\u1eadp c\u00e2u h\u1ecfi.",
                citations=[], model_used="none", finish_reason="no_context",
            )

        user_prompt = (
            f"## Context t\u1eeb t\u00e0i li\u1ec7u v\u00e0 ngu\u1ed3n h\u1ecdc thu\u1eadt b\u00ean ngo\u00e0i:\n{combined_context}\n\n"
            f"## C\u00e2u h\u1ecfi:\n{query}\n\n"
            "H\u00e3y x\u00e1c th\u1ef1c c\u00e1c tuy\u00ean b\u1ed1 nghi\u00ean c\u1ee9u d\u1ef1a tr\u00ean d\u1eef li\u1ec7u tr\u00ean. "
            "Ph\u00e2n bi\u1ec7t r\u00f5 ngu\u1ed3n t\u1eeb local PDF v\u00e0 ngu\u1ed3n t\u1eeb OpenAlex/Crossref."
        )

        system_prompt = self._get_verify_system_prompt()
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
        citations = []
        pattern = r'\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]'
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
    ):
        self._local.reasoning_mode = reasoning_mode
        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        if reasoning_mode in ("deep", "deep_plus", "deep+"):
            max_tokens = 4096

        if context_text == "__EXTERNAL_KNOWLEDGE__":
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = f"Câu hỏi: {query}\n\nHãy trả lời câu hỏi trên bằng kiến thức sẵn có của bạn một cách tự nhiên và thoải mái."
        elif not context_text.strip() or len(context_text.strip()) < 50:
            self._local.system_prompt_override = self._get_external_system_prompt()
            user_prompt = query
        else:
            self._local.system_prompt_override = None
            user_prompt = (
                f"## Context từ tài liệu:\n{context_text}\n\n"
                f"## Câu hỏi:\n{query}\n\n"
                "Trả lời dựa trên context trên (nếu có thông tin liên quan). "
                "Nhớ trích dẫn nguồn [Tên Paper] cho mỗi thông tin bạn đưa ra."
            )

        yield from self._stream_chain(user_prompt, max_tokens, task_type)

    def stream_generate_verify(
        self,
        query: str,
        context_text: str,
        task_type: str = "verify",
    ):
        if not context_text.strip() or len(context_text.strip()) < 50:
            yield "Kh\u00f4ng t\u00ecm th\u1ea5y t\u00e0i li\u1ec7u li\u00ean quan. Vui l\u00f2ng import PDF tr\u01b0\u1edbc ho\u1eb7c th\u1eed c\u00e2u h\u1ecfi kh\u00e1c."
            return

        max_tokens = self.MODE_MAX_TOKENS.get(task_type, self.MODE_MAX_TOKENS["default"])
        self._system_prompt_override = self._get_verify_system_prompt()

        user_prompt = (
            f"## Context t\u1eeb t\u00e0i li\u1ec7u v\u00e0 ngu\u1ed3n h\u1ecdc thu\u1eadt b\u00ean ngo\u00e0i:\n{context_text}\n\n"
            f"## C\u00e2u h\u1ecfi:\n{query}\n\n"
            "H\u00e3y x\u00e1c th\u1ef1c c\u00e1c tuy\u00ean b\u1ed1 nghi\u00ean c\u1ee9u d\u1ef1a tr\u00ean d\u1eef li\u1ec7u tr\u00ean. "
            "Ph\u00e2n bi\u1ec7t r\u00f5 ngu\u1ed3n t\u1eeb local PDF v\u00e0 ngu\u1ed3n t\u1eeb OpenAlex/Crossref."
        )

        yield from self._stream_chain(user_prompt, max_tokens, task_type)

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
            if self.github_api_key:
                self._set_model(f"github/{self.github_model}")
                yielded = False
                for chunk in self._stream_openai(user_prompt, self.github_api_key, self.github_model, self.github_url, max_tokens):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            if self.gemini_api_key:
                self._set_model(f"gemini/{self.gemini_model}")
                yielded = False
                for chunk in self._stream_gemini(user_prompt, self.gemini_api_key, max_tokens, is_free=True):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            if self.groq_api_key:
                self._set_model(f"groq/{self.groq_model}")
                yielded = False
                for chunk in self._stream_openai(user_prompt, self.groq_api_key, self.groq_model, "https://api.groq.com/openai/v1", max_tokens):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            if self.nvidia_api_key:
                self._set_model(f"nvidia/{self.nvidia_model}")
                yielded = False
                for chunk in self._stream_openai(user_prompt, self.nvidia_api_key, self.nvidia_model, self.nvidia_url, max_tokens):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            if self.nvidia_deepseek_api_key:
                self._set_model(f"nvidia/{self.nvidia_deepseek_model}")
                yielded = False
                for chunk in self._stream_openai(user_prompt, self.nvidia_deepseek_api_key, self.nvidia_deepseek_model, self.nvidia_url, max_tokens):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            self._set_model(f"local/{self.local_model}")
            yield "\u26a0\ufe0f T\u1ea5t c\u1ea3 cloud_free \u0111\u1ec1u l\u1ed7i. \u0110ang chuy\u1ec3n sang Local model...\n"
            for chunk in self._stream_local(user_prompt):
                yield chunk

        elif self.mode == "cloud_custom":
            if self.custom_cloud_provider == "deepseek":
                if not self.deepseek_api_key:
                    self._set_model("deepseek/no_key")
                    yield "\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp DeepSeek API Key."
                    return
                self._set_model(f"deepseek/{self.deepseek_model}")
                for chunk in self._stream_deepseek(user_prompt, self.deepseek_api_key, max_tokens, is_free=False):
                    yield chunk
            elif self.custom_cloud_provider == "gemini":
                if not self.gemini_api_key:
                    self._set_model("gemini/no_key")
                    yield "\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Gemini API Key."
                    return
                self._set_model(f"gemini/{self.gemini_model}")
                for chunk in self._stream_gemini(user_prompt, self.gemini_api_key, max_tokens, is_free=False):
                    yield chunk
            elif self.custom_cloud_provider == "claude":
                if not self.claude_api_key:
                    self._set_model("claude/no_key")
                    yield "\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Claude API Key."
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
                    yield f"\n\u26a0\ufe0f Claude stream g\u1eb7p s\u1ef1 c\u1ed1: {str(e)}. \u0110ang chuy\u1ec3n sang Local model..."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            elif self.custom_cloud_provider == "groq":
                if not self.groq_api_key:
                    self._set_model("groq/no_key")
                    yield "\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Groq API Key."
                    return
                self._set_model(f"groq/{self.groq_model}")
                try:
                    yield from self._stream_openai(user_prompt, self.groq_api_key, self.groq_model, "https://api.groq.com/openai/v1", max_tokens)
                except Exception as e:
                    self._set_model(f"local/{self.local_model}")
                    yield f"\n\u26a0\ufe0f Groq stream g\u1eb7p s\u1ef1 c\u1ed1: {str(e)}."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            elif self.custom_cloud_provider == "nvidia":
                if not self.nvidia_api_key:
                    self._set_model("nvidia/no_key")
                    yield "\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp Nvidia API Key."
                    return
                self._set_model(f"nvidia/{self.nvidia_model}")
                try:
                    yield from self._stream_openai(user_prompt, self.nvidia_api_key, self.nvidia_model, self.nvidia_url, max_tokens)
                except Exception as e:
                    self._set_model(f"local/{self.local_model}")
                    yield f"\n\u26a0\ufe0f Nvidia stream g\u1eb7p s\u1ef1 c\u1ed1: {str(e)}."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            elif self.custom_cloud_provider == "freemodel":
                if not self.freemodel_api_key:
                    self._set_model("freemodel/no_key")
                    yield "\u26a0\ufe0f B\u1ea1n ch\u01b0a nh\u1eadp FreeModel API Key."
                    return
                self._set_model(f"freemodel/{self.freemodel_model}")
                try:
                    yield from self._stream_openai(user_prompt, self.freemodel_api_key, self.freemodel_model, self.freemodel_url, max_tokens)
                except Exception as e:
                    self._set_model(f"local/{self.local_model}")
                    yield f"\n\u26a0\ufe0f FreeModel stream g\u1eb7p s\u1ef1 c\u1ed1: {str(e)}."
                    for chunk in self._stream_local(user_prompt):
                        yield chunk
            else:
                self._set_model("unknown/invalid")
                yield "\u26a0\ufe0f Cloud provider kh\u00f4ng h\u1ee3p l\u1ec7."

        else:
            self._set_model(f"local/{self.local_model}")
            for chunk in self._stream_local(user_prompt):
                yield chunk
