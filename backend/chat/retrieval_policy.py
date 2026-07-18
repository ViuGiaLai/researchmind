"""Adaptive retrieval controls that remain deterministic and local."""
import re
def adaptive_top_k(query: str, requested: int = 5) -> int:
    words = re.findall(r"\w+", query or "")
    comparative = bool(re.search(r"(?i)compare|contrast|versus|review|synthesize|so sánh", query or ""))
    return max(requested, 10) if comparative or len(words) > 24 else (min(requested, 5) if len(words) < 5 else max(requested, 7))
def decompose_query(query: str, limit: int = 3) -> list[str]:
    parts = [p.strip(" .?") for p in re.split(r"(?i)\s+(?:and|versus|vs\.?|compared with)\s+|[;]", query or "") if p.strip()]
    return [query] + [p for p in parts if p.lower() != query.lower()][:max(0, limit - 1)]
