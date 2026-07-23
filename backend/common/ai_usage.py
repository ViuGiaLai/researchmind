"""Bounded-memory helpers for estimating persisted AI usage."""

from collections.abc import Iterable, Sequence

from common.text_utils import count_tokens


def estimate_content_tokens(
    rows: Iterable[Sequence[str | None]],
    *,
    stop_after: int | None = None,
) -> tuple[int, int]:
    """Return ``(estimated_tokens, row_count)`` without materializing rows.

    ``stop_after`` permits budget checks to stop as soon as the known allowance
    has been exceeded. Metrics callers can omit it to consume the full stream.
    """
    estimated_tokens = 0
    row_count = 0
    for row in rows:
        estimated_tokens += count_tokens(row[0] or "")
        row_count += 1
        if stop_after is not None and estimated_tokens > stop_after:
            break
    return estimated_tokens, row_count
