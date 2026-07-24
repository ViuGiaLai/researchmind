"""Retrieval postprocessors — llama_index-inspired.

MIT License — adapted from llama_index:
https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/postprocessor/node.py

Typical usage:
    pipeline = [
        SimilarityPostprocessor(similarity_cutoff=0.3),
        LongContextReorder(),
    ]
    for pp in pipeline:
        chunks = pp(chunks)
"""

from abc import ABC, abstractmethod
from typing import Any


class BaseNodePostprocessor(ABC):
    @abstractmethod
    def __call__(self, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]: ...


class SimilarityPostprocessor(BaseNodePostprocessor):
    """Filter chunks below a similarity score threshold.

    Removes chunks whose 'score' is below `similarity_cutoff`.
    Chunks with score=None are kept (assumed un-scored).
    """

    def __init__(self, similarity_cutoff: float = 0.0):
        self.similarity_cutoff = similarity_cutoff

    def __call__(self, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if self.similarity_cutoff <= 0.0:
            return chunks
        return [c for c in chunks if c.get("score") is None or c["score"] >= self.similarity_cutoff]


class LongContextReorder(BaseNodePostprocessor):
    """Reorder chunks to mitigate "lost in the middle" effect.

    Places the highest-scoring chunks at the beginning and end of
    the list, where LLMs typically pay more attention.
    """

    def __call__(self, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(chunks) <= 3:
            return chunks

        sorted_chunks = sorted(chunks, key=lambda c: c.get("score") or 0.0)
        reordered: list[dict[str, Any]] = []
        for i, c in enumerate(sorted_chunks):
            if i % 2 == 0:
                reordered.insert(0, c)
            else:
                reordered.append(c)
        return reordered


class RerankPostprocessor(BaseNodePostprocessor):
    """Placeholder for future LLM-based reranking."""

    def __call__(self, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return chunks
