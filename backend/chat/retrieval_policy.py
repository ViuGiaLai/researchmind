"""Adaptive retrieval controls that remain deterministic and local."""
import re
def adaptive_top_k(query: str, requested: int = 5, task_type: str = "") -> int:
    # Task-type overrides (lowest priority, applied before adaptive logic)
    task_cap = {
        "debate": 4,
        "verify": 6,
        "review": 6,
        "critique": 6,
    }
    task_max = task_cap.get(task_type.strip().lower(), 99)

    words = re.findall(r"\w+", query or "")
    comparative = bool(re.search(r"(?i)compare|contrast|versus|review|synthesize|so sánh", query or ""))
    result = max(requested, 10) if comparative or len(words) > 24 else (min(requested, 5) if len(words) < 5 else max(requested, 7))
    return min(result, task_max)
def decompose_query(query: str, limit: int = 3) -> list[str]:
    parts = [p.strip(" .?") for p in re.split(r"(?i)\s+(?:and|versus|vs\.?|compared with)\s+|[;]", query or "") if p.strip()]
    return [query] + [p for p in parts if p.lower() != query.lower()][:max(0, limit - 1)]
