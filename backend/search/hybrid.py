"""Hybrid search combining BM25 + Vector results with RRF fusion and cross-encoder re-ranking."""

from typing import Optional
from dataclasses import dataclass
from loguru import logger


@dataclass
class SearchResult:
    chunk_id: str
    paper_id: str
    paper_title: str
    chunk_index: int
    content: str
    page_number: Optional[int]
    score: float
    rank_source: str = "hybrid"  # bm25, vector, or hybrid


class HybridSearch:
    """
    Hybrid search: combines BM25 (SQLite FTS5) and Vector (ChromaDB) results
    using Reciprocal Rank Fusion (RRF), then optionally re-ranks with a
    cross-encoder model.
    """

    def __init__(
        self,
        bm25_search,
        vector_search,
        embedder,
        rrf_k: int = 60,
        top_k_final: int = 10,
    ):
        self.bm25 = bm25_search
        self.vector = vector_search
        self.embedder = embedder
        self.rrf_k = rrf_k
        self.top_k_final = top_k_final
        self._cross_encoder = None

    def search(
        self,
        query: str,
        paper_ids: Optional[list[str]] = None,
        top_k: int = 10,
        use_reranker: bool = True,
    ) -> list[SearchResult]:
        """
        Execute hybrid search.

        Args:
            query: Natural language search query.
            paper_ids: Optional filter to specific papers.
            top_k: Number of results to return.
            use_reranker: Whether to apply cross-encoder re-ranking.

        Returns:
            List of SearchResult sorted by relevance.
        """
        # Step 1: BM25 search
        logger.debug(f"BM25 search: '{query}'")
        bm25_results = self.bm25.search(query, paper_ids, top_k=20)

        # Step 2: Vector search
        logger.debug(f"Vector search: '{query}'")
        query_embedding = self.embedder.embed_query(query)
        vector_results = self.vector.search(query_embedding, paper_ids, top_k=20)

        # Step 3: Reciprocal Rank Fusion
        logger.debug(f"RRF fusion: {len(bm25_results)} BM25 + {len(vector_results)} Vector")
        fused = self._rrf_fuse(bm25_results, vector_results)

        # Step 4: Cross-encoder re-ranking
        if use_reranker and fused:
            fused = self._rerank(query, fused)

        # Step 5: Take top_k
        final = fused[:top_k]

        # Convert to SearchResult
        results = []
        for i, item in enumerate(fused[:top_k]):
            results.append(SearchResult(
                chunk_id=item.get("chunk_id", str(i)),
                paper_id=item.get("paper_id", ""),
                paper_title=item.get("paper_title", ""),
                chunk_index=int(item.get("chunk_index", 0)),
                content=item.get("content", ""),
                page_number=item.get("page_number"),
                score=float(item.get("score", 0)),
                rank_source="hybrid",
            ))

        return results

    def _rrf_fuse(self, bm25_results, vector_results) -> list[dict]:
        """
        Reciprocal Rank Fusion.

        RRF score = sum(1 / (k + rank_i)) for each item across all rankings.
        """
        import math

        # Normalize BM25 scores to 0-1 range
        if bm25_results:
            max_bm25 = max(r.score for r in bm25_results) or 1.0
            bm25_normalized = [(r, r.score / max_bm25) for r in bm25_results]
            bm25_sorted = sorted(bm25_normalized, key=lambda x: x[1], reverse=True)
        else:
            bm25_sorted = []

        # Normalize vector scores to 0-1 range
        if vector_results:
            max_vec = max(r.score for r in vector_results) or 1.0
            vec_normalized = [(r, r.score / max_vec) for r in vector_results]
            vec_sorted = sorted(vec_normalized, key=lambda x: x[1], reverse=True)
        else:
            vec_sorted = []

        # Build RRF scores
        rrf_scores: dict[str, dict] = {}

        for rank, (result, _) in enumerate(bm25_sorted):
            key = f"{result.paper_id}_{result.chunk_index}"
            if key not in rrf_scores:
                rrf_scores[key] = {
                    "chunk_id": str(result.chunk_id),
                    "paper_id": result.paper_id,
                    "paper_title": result.paper_title,
                    "chunk_index": result.chunk_index,
                    "content": result.content,
                    "page_number": result.page_number,
                    "score": 0.0,
                }
            rrf_scores[key]["score"] += 1.0 / (self.rrf_k + rank + 1)

        for rank, (result, _) in enumerate(vec_sorted):
            key = f"{result.paper_id}_{result.chunk_index}"
            if key not in rrf_scores:
                rrf_scores[key] = {
                    "chunk_id": result.chunk_id,
                    "paper_id": result.paper_id,
                    "paper_title": result.paper_title,
                    "chunk_index": result.chunk_index,
                    "content": result.content,
                    "page_number": result.page_number,
                    "score": 0.0,
                }
            rrf_scores[key]["score"] += 1.0 / (self.rrf_k + rank + 1)

        # Sort by RRF score
        sorted_results = sorted(
            rrf_scores.values(),
            key=lambda x: x["score"],
            reverse=True,
        )

        return sorted_results

    def _rerank(self, query: str, results: list[dict]) -> list[dict]:
        """
        Re-rank results using a cross-encoder model.
        """
        if not results:
            return results

        try:
            model = self._get_cross_encoder()
            if model is None:
                return results

            pairs = [(query, r["content"]) for r in results]
            scores = model.predict(pairs)

            for i, score in enumerate(scores):
                results[i]["score"] = float(score)

            results.sort(key=lambda x: x["score"], reverse=True)
        except Exception as e:
            logger.warning(f"Cross-encoder re-ranking failed: {e}")

        return results

    def _get_cross_encoder(self):
        """Lazy-load cross-encoder model."""
        if self._cross_encoder is None:
            try:
                from sentence_transformers import CrossEncoder
                self._cross_encoder = CrossEncoder(
                    "cross-encoder/ms-marco-MiniLM-L-6-v2"
                )
                logger.info("Cross-encoder model loaded")
            except Exception as e:
                logger.warning(f"Failed to load cross-encoder: {e}")
                return None
        return self._cross_encoder
