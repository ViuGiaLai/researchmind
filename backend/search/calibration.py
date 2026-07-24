"""Intent-aware hybrid retrieval weights."""

import re


def retrieval_weights(query: str) -> tuple[float, float]:
    exact = bool(re.search(r'"[^"]+"|\bdoi\b|\b[A-Z]{2,}\d+\b', query or ""))
    conceptual = bool(re.search(r"(?i)why|how|concept|theory|explain|synthesize", query or ""))
    if exact:
        return 0.7, 0.3
    if conceptual:
        return 0.25, 0.75
    return 0.4, 0.6
