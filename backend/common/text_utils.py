"""Text utilities: extended thinking content cleaning, Unicode normalization.

Adapted from open-notebook (MIT):
https://github.com/lfnovo/open-notebook/blob/main/open_notebook/utils/text_utils.py
"""

import re


def clean_thinking_content(content: str) -> str:
    """
    Remove <think>...</think> blocks from model responses.
    Handles malformed output (missing closing tag).

    Adapted from open-notebook text_utils.py:42-119.
    """
    if not content:
        return content

    result = content
    # Try matching complete <think>...</think> blocks (non-greedy)
    result = re.sub(r"<think>.*?</think>\s*", "", result, flags=re.DOTALL)

    # If still has unclosed <think>, strip from <think> onward
    if "<think>" in result:
        idx = result.index("<think>")
        # Keep anything before <think>
        result = result[:idx].rstrip()

    return result.strip()


def extract_thinking_content(content: str) -> tuple[str, str]:
    """
    Split content into (thinking, answer) parts.

    Returns:
        (thinking_text, answer_text) or ("", content) if no think tags found.
    """
    if not content or "<think>" not in content:
        return "", content

    match = re.match(r"<think>\s*(.*?)\s*</think>\s*(.*)", content, re.DOTALL)
    if match:
        return match.group(1).strip(), match.group(2).strip()

    # Unclosed <think> tag
    idx = content.index("<think>")
    thinking = content[idx + 7:].strip()
    before = content[:idx].strip()
    return thinking, before


def count_tokens(text: str, model: str = "gpt-4o") -> int:
    """
    Estimate token count using tiktoken if available.
    Falls back to rough character-based estimate (4 chars per token).

    Adapted from open-notebook token_utils.py.
    """
    try:
        import tiktoken
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except (ImportError, KeyError):
        pass

    try:
        import tiktoken
        encoding = tiktoken.get_encoding("o200k_base")
        return len(encoding.encode(text))
    except ImportError:
        pass

    # Rough estimate: ~4 characters per token for mixed text
    return len(text) // 4


def truncate_to_token_limit(text: str, max_tokens: int, model: str = "gpt-4o") -> str:
    """
    Truncate text to fit within max_tokens.
    Tries to break at sentence boundary.
    """
    estimated = count_tokens(text, model)
    if estimated <= max_tokens:
        return text

    # Binary search for the right truncation point
    ratio = max_tokens / max(estimated, 1)
    chars_to_keep = int(len(text) * ratio * 0.9)  # buffer

    if chars_to_keep >= len(text):
        return text

    truncated = text[:chars_to_keep]
    # Try to break at sentence boundary
    sentence_end = max(
        truncated.rfind(". "),
        truncated.rfind("! "),
        truncated.rfind("? "),
        truncated.rfind("\n"),
    )
    if sentence_end > len(truncated) * 0.5:
        truncated = truncated[: sentence_end + 1]

    return truncated.strip()
