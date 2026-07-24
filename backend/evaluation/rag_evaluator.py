"""Offline RAG evaluation metrics; no network or model dependency."""

from dataclasses import dataclass


@dataclass
class RagCase:
    query: str
    relevant_chunk_ids: set[str]


def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    return 0.0 if not relevant else len(set(retrieved[:k]) & relevant) / len(relevant)


def reciprocal_rank(retrieved: list[str], relevant: set[str]) -> float:
    for rank, chunk_id in enumerate(retrieved, 1):
        if chunk_id in relevant:
            return 1 / rank
    return 0.0


def evaluate_case(case: RagCase, retrieved: list[str], k: int = 5) -> dict[str, float]:
    return {
        "recall_at_k": recall_at_k(retrieved, case.relevant_chunk_ids, k),
        "mrr": reciprocal_rank(retrieved, case.relevant_chunk_ids),
    }
