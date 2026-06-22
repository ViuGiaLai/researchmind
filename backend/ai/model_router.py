"""Smart model selection with token-count-based fallback.

Adapted from open-notebook (MIT):
https://github.com/lfnovo/open-notebook/blob/main/open_notebook/ai/provision.py

Usage:
    router = ModelRouter(
        default_model="Qwen3-4B-Q4_K_M.gguf",
        large_context_model="claude-sonnet-4-20250514",
        large_context_threshold=105000,
    )
    selected = router.select_for_content(content, preferred_model=None)
"""

from dataclasses import dataclass
from loguru import logger

from common.text_utils import count_tokens


@dataclass
class ModelSelection:
    provider: str  # "local", "claude", "deepseek", "gemini", "groq", "nvidia"
    model: str
    reason: str
    token_count: int = 0


class ModelRouter:
    """
    Smart model selector that chooses the right model based on:
    1. Token count (auto-fallback to large-context model)
    2. Explicit model override
    3. Default per-type fallback

    Integrates with Generator's existing provider configuration.
    """

    LARGE_CONTEXT_THRESHOLD = 105_000  # tokens

    CHAT_TYPES = ("chat", "review", "critique")
    SEARCH_TYPES = ("search", "query")
    TRANSFORM_TYPES = ("summarize", "translate", "extract")

    def __init__(
        self,
        default_model: str = "Qwen3-4B-Q4_K_M.gguf",
        default_provider: str = "local",
        large_context_model: str = "",
        large_context_provider: str = "",
        large_context_threshold: int = LARGE_CONTEXT_THRESHOLD,
        # Mapping from provider to model for quick lookup
        model_map: dict | None = None,
    ):
        self.default_model = default_model
        self.default_provider = default_provider
        self.large_context_model = large_context_model or default_model
        self.large_context_provider = large_context_provider or default_provider
        self.large_context_threshold = large_context_threshold
        self.model_map = model_map or {}
        # model_map: {"local": "Qwen3-4B...", "claude": "claude-sonnet-4...", ...}

    def select_for_content(
        self,
        content: str,
        preferred_model: str | None = None,
        preferred_provider: str | None = None,
        task_type: str = "chat",
    ) -> ModelSelection:
        """
        Select the best model for the given content.

        Priority:
        1. preferred_model if specified
        2. Large-context model if token count > threshold
        3. Default model for the task type

        Args:
            content: The input text to be sent to the model.
            preferred_model: User wants a specific model name.
            preferred_provider: User wants a specific provider.
            task_type: "chat", "search", "transform"

        Returns:
            ModelSelection with provider, model, and selection reason.
        """
        token_count = count_tokens(content)
        logger.debug(f"Content token estimate: {token_count}")

        # Priority 1: Explicit model override
        if preferred_model:
            provider = preferred_provider or self._infer_provider(preferred_model)
            return ModelSelection(
                provider=provider,
                model=preferred_model,
                reason=f"user override: {preferred_model}",
                token_count=token_count,
            )

        # Priority 2: Content too long for default model
        if token_count > self.large_context_threshold:
            logger.info(
                f"Content {token_count}t > threshold {self.large_context_threshold}, "
                f"using large-context model: {self.large_context_model}"
            )
            return ModelSelection(
                provider=self.large_context_provider,
                model=self.large_context_model,
                reason=f"token_count {token_count} > {self.large_context_threshold}",
                token_count=token_count,
            )

        # Priority 3: Default model
        return ModelSelection(
            provider=self.default_provider,
            model=self.default_model,
            reason=f"default for {task_type}",
            token_count=token_count,
        )

    def _infer_provider(self, model_name: str) -> str:
        """Infer provider from model name."""
        name = model_name.lower()
        if any(kw in name for kw in ("claude", "anthropic")):
            return "claude"
        if "deepseek" in name:
            return "deepseek"
        if "gemini" in name:
            return "gemini"
        if "groq" in name:
            return "groq"
        if "nvidia" in name or "kimi" in name:
            return "nvidia"
        if "gpt" in name or "freemodel" in name:
            return "freemodel"
        if "gguf" in name or "qwen" in name:
            return "local"
        return self.default_provider

    def select_search_model(
        self,
        query: str,
        context_parts: list[str],
        preferred: str | None = None,
    ) -> ModelSelection:
        """Select the best model for search/generation.

        Search typically uses less context budget for the model call
        (most context is in retrieval, not in the LLM prompt).
        """
        combined = query + "\n".join(context_parts)
        return self.select_for_content(combined, preferred, task_type="search")

    def select_chat_model(
        self,
        message: str,
        history_parts: list[str] | None = None,
        context_parts: list[str] | None = None,
        preferred: str | None = None,
    ) -> ModelSelection:
        """Select model for chat, considering message + history + context."""
        parts = [message]
        if history_parts:
            parts.extend(history_parts)
        if context_parts:
            parts.extend(context_parts)
        combined = "\n".join(parts)
        return self.select_for_content(combined, preferred, task_type="chat")
