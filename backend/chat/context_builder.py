"""Token-budgeted context assembly for RAG.

Adapted from open-notebook (MIT):
https://github.com/lfnovo/open-notebook/blob/main/open_notebook/utils/context_builder.py

Builds context strings with priority-based truncation to fit within a token budget.
Supports multiple content types: sources, notes, insights, chat history.
"""

from dataclasses import dataclass, field
from typing import Any

from common.i18n import get_output_language_name
from common.text_utils import count_tokens, truncate_to_token_limit


_ROLE_LABELS: dict[str, dict[str, str]] = {
    "vi": {"user": "Người", "assistant": "Trợ lý"},
    "en": {"user": "User", "assistant": "Assistant"},
    "ja": {"user": "ユーザー", "assistant": "アシスタント"},
}


@dataclass
class ContextItem:
    content: str
    priority: float  # 0.0 (lowest) to 1.0 (highest)
    source_type: str  # "source", "note", "insight", "history", "system"
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class ContextBuildResult:
    text: str
    token_count: int
    used_items: int
    total_items: int
    truncated: bool


class ContextBuilder:
    """
    Assembles context from multiple sources with token budgeting.

    Priority ranking (higher = kept first when budget is tight):
    - 1.0: Direct source context (the exact paper being discussed)
    - 0.8: Relevant search results
    - 0.6: Chat history (recent messages)
    - 0.5: Source insights/analysis
    - 0.3: Notes
    - 0.2: System instructions
    """

    RESERVED_OUTPUT_TOKENS = 2048  # tokens reserved for model response

    def __init__(
        self,
        token_budget: int = 8000,
        model: str = "gpt-4o",
        lang: str = "vi",
    ):
        self.token_budget = token_budget
        self.model = model
        self.lang = lang
        self.items: list[ContextItem] = []

    def add(
        self,
        content: str,
        priority: float = 0.5,
        source_type: str = "source",
        metadata: dict | None = None,
    ) -> None:
        """Add a content item to the context."""
        if not content or not content.strip():
            return
        self.items.append(ContextItem(
            content=content.strip(),
            priority=max(0.0, min(1.0, priority)),
            source_type=source_type,
            metadata=metadata or {},
        ))

    def add_source(self, content: str, title: str = "", page: int | None = None) -> None:
        """Add a source document chunk with high priority."""
        self.add(content, priority=1.0, source_type="source",
                 metadata={"title": title, "page": page})

    def add_search_results(self, chunks: list[dict], max_chunks: int = 5) -> None:
        """Add search result chunks with medium-high priority."""
        for i, chunk in enumerate(chunks[:max_chunks]):
            title = chunk.get("paper_title", chunk.get("title", ""))
            page = chunk.get("page_number")
            label = f"[{title}]" + (f" (trang {page})" if page else "")
            content = f"{label}\n{chunk.get('content', chunk.get('text', ''))}"
            self.add(content, priority=0.8, source_type="search",
                     metadata={"title": title, "page": page})

    def add_history(self, messages: list[dict], max_pairs: int = 5) -> None:
        """
        Add chat history.
        messages: list of {"role": "...", "content": "..."}
        """
        labels = _ROLE_LABELS.get(self.lang, _ROLE_LABELS["vi"])
        recent = messages[-(max_pairs * 2):]  # limit pairs
        parts = []
        for msg in recent:
            role = labels["user"] if msg.get("role") == "user" else labels["assistant"]
            parts.append(f"{role}: {msg.get('content', '')}")
        if parts:
            self.add("\n".join(parts), priority=0.6, source_type="history")

    def add_insight(self, content: str, label: str = "") -> None:
        """Add an analysis insight with medium priority."""
        text = f"[Phân tích: {label}]\n{content}" if label else content
        self.add(text, priority=0.5, source_type="insight",
                 metadata={"label": label})

    def add_note(self, content: str) -> None:
        """Add a note with lower priority."""
        self.add(content, priority=0.3, source_type="note")

    def add_system(self, content: str) -> None:
        """Add system instructions (always kept, lowest priority)."""
        self.add(content, priority=0.2, source_type="system")

    def build(self, reserved_tokens: int | None = None) -> ContextBuildResult:
        """
        Assemble context within token budget.

        1. Sort items by priority (descending)
        2. Greedily include items until budget is reached
        3. Truncate the last included item if needed

        Args:
            reserved_tokens: Override reserved output tokens (default: self.RESERVED_OUTPUT_TOKENS)

        Returns:
            ContextBuildResult with assembled text and metadata.
        """
        if not self.items:
            return ContextBuildResult(
                text="",
                token_count=0,
                used_items=0,
                total_items=0,
                truncated=False,
            )

        reserved = reserved_tokens or self.RESERVED_OUTPUT_TOKENS
        budget = self.token_budget - reserved
        if budget < 256:
            budget = 256  # minimum useful context

        # Sort by priority descending
        sorted_items = sorted(self.items, key=lambda x: (-x.priority, -len(x.content)))

        selected: list[ContextItem] = []
        total_tokens = 0
        truncated = False

        for item in sorted_items:
            item_tokens = count_tokens(item.content, self.model)

            if total_tokens + item_tokens <= budget:
                selected.append(item)
                total_tokens += item_tokens
            elif total_tokens < budget * 0.5 and not selected:
                # First item is too large — truncate it
                allowed = budget - total_tokens - 64
                if allowed > 128:
                    item.content = truncate_to_token_limit(item.content, allowed, self.model)
                    selected.append(item)
                    total_tokens += count_tokens(item.content, self.model)
                    truncated = True
                break
            else:
                truncated = True
                break

        # Assemble text
        parts = []
        for item in selected:
            parts.append(item.content)

        text = "\n\n".join(parts)

        return ContextBuildResult(
            text=text,
            token_count=total_tokens,
            used_items=len(selected),
            total_items=len(self.items),
            truncated=truncated,
        )

    def reset(self) -> None:
        """Clear all items."""
        self.items.clear()
