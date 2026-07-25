"""Multi-turn conversation history helpers for chat generation.

History is treated as untrusted context (like retrieved documents): it is
normalized, truncated, and prepended to the user prompt so every provider
(local GGUF, cloud APIs) sees prior turns without needing native multi-turn
message APIs.

Prompt scaffolding is English-only (models follow English instructions more
reliably). UI status strings are filtered via language-agnostic markers.
"""

from __future__ import annotations

import re
from typing import Any

DEFAULT_MAX_PAIRS = 5
DEFAULT_MAX_CHARS_PER_MESSAGE = 1200

# Language-agnostic / English markers for transient UI status lines that must
# never be fed back to the model as conversation history.
_PLACEHOLDER_MARKERS = (
    "searching",
    "processing",
    "connecting",
    "thinking",
    "working",
    "from cache",
    "responding from cache",
    "please wait",
    "loading",
    "generating",
)

# Also drop very short lines that look like progress status (ellipsis / spinner copy).
_STATUS_LINE_RE = re.compile(
    r"^(?:[\W_]*)?(?:searching|processing|connecting|thinking|working|loading|generating)\b.*$",
    re.IGNORECASE,
)


def normalize_history(
    raw: Any,
    *,
    max_pairs: int = DEFAULT_MAX_PAIRS,
    max_chars: int = DEFAULT_MAX_CHARS_PER_MESSAGE,
    exclude_last_user: str | None = None,
) -> list[dict[str, str]]:
    """Normalize client/DB history into [{role, content}, ...] pairs.

    Keeps at most ``max_pairs`` complete user/assistant exchanges (plus a
    trailing user if present). Drops empty rows and UI placeholder assistant
    messages. Optionally drops a trailing user message that matches the
    current query (avoids duplicating the live turn when clients resend it).
    """
    if not raw:
        return []
    if not isinstance(raw, list):
        return []

    cleaned: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in ("user", "assistant"):
            continue
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        if role == "assistant" and _is_placeholder(content):
            continue
        if len(content) > max_chars:
            content = content[: max_chars - 1].rstrip() + "…"
        cleaned.append({"role": role, "content": content})

    if exclude_last_user and cleaned:
        last = cleaned[-1]
        if last["role"] == "user" and last["content"].strip() == exclude_last_user.strip():
            cleaned = cleaned[:-1]

    max_messages = max(0, max_pairs * 2)
    if max_messages and len(cleaned) > max_messages:
        cleaned = cleaned[-max_messages:]
    # Prefer starting on a user turn so truncated windows are coherent pairs.
    while cleaned and cleaned[0]["role"] != "user":
        cleaned = cleaned[1:]
    return cleaned


def format_history_block(history: list[dict[str, str]] | None) -> str:
    """Render history as an English prompt block for any single-turn provider."""
    if not history:
        return ""
    lines = [
        "## Conversation history",
        "Prior turns in this session. Use them to resolve short follow-ups "
        "(e.g. 'more details', 'why', 'explain that', 'continue').",
    ]
    for msg in history:
        label = "User" if msg["role"] == "user" else "Assistant"
        lines.append(f"{label}: {msg['content']}")
    return "\n".join(lines)


def apply_history_to_prompt(user_prompt: str, history: list[dict[str, str]] | None) -> str:
    """Prepend conversation history to a user prompt when present."""
    block = format_history_block(history)
    if not block:
        return user_prompt
    prompt = (user_prompt or "").strip()
    if not prompt:
        return block
    return f"{block}\n\n{prompt}"


def history_fingerprint(history: list[dict[str, str]] | None) -> str:
    """Stable compact fingerprint for cache keys."""
    if not history:
        return ""
    parts: list[str] = []
    for msg in history:
        role = msg.get("role", "")
        content = re.sub(r"\s+", " ", (msg.get("content") or "")).strip().lower()
        if len(content) > 160:
            content = content[:160]
        parts.append(f"{role}:{content}")
    return "||".join(parts)


def load_history_from_rows(
    rows: list[Any],
    *,
    max_pairs: int = DEFAULT_MAX_PAIRS,
    max_chars: int = DEFAULT_MAX_CHARS_PER_MESSAGE,
    exclude_last_user: str | None = None,
) -> list[dict[str, str]]:
    """Convert ORM ChatHistory rows (or dict-like) into normalized history."""
    raw: list[dict[str, str]] = []
    for row in rows:
        if isinstance(row, dict):
            role = row.get("role", "")
            content = row.get("content", "")
        else:
            role = getattr(row, "role", "")
            content = getattr(row, "content", "")
        raw.append({"role": str(role), "content": str(content)})
    return normalize_history(
        raw,
        max_pairs=max_pairs,
        max_chars=max_chars,
        exclude_last_user=exclude_last_user,
    )


def _is_placeholder(content: str) -> bool:
    """True for short transient status lines (not real assistant answers)."""
    lower = content.strip().lower()
    if not lower or len(lower) > 100:
        return False
    if any(marker in lower for marker in _PLACEHOLDER_MARKERS):
        return True
    if _STATUS_LINE_RE.match(lower):
        return True
    # Bare progress ellipsis / spinner-style status
    if len(lower) <= 40 and lower.endswith("...") and " " not in lower.strip("."):
        return True
    return False
