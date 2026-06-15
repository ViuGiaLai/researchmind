"""RAG retrieval pipeline.

Takes a user query, runs hybrid search, builds context for LLM.
"""

from typing import Optional
from dataclasses import dataclass
from loguru import logger


@dataclass
class RetrievalResult:
    """Result of a RAG retrieval step."""
    chunks: list[dict]
    context_text: str
    total_chunks: int
    papers_used: list[str]


class Retriever:
    """
    RAG retrieval pipeline:
    1. Query processing (language detection, expansion)
    2. Hybrid search (BM25 + Vector + RRF + Cross-encoder)
    3. Context building
    """

    def __init__(self, hybrid_search):
        self.hybrid = hybrid_search

    def retrieve(
        self,
        query: str,
        paper_ids: Optional[list[str]] = None,
        top_k: int = 5,
    ) -> RetrievalResult:
        """
        Retrieve relevant chunks for a query.

        Args:
            query: User's natural language query.
            paper_ids: Optional filter to specific papers.
            top_k: Number of chunks to retrieve.

        Returns:
            RetrievalResult with chunks, context text, and metadata.
        """
        # Step 1: Query expansion
        expanded_queries = self._expand_query(query)

        # Step 2: Search with original query
        search_results = self.hybrid.search(
            query=query,
            paper_ids=paper_ids,
            top_k=top_k,
            use_reranker=True,
        )

        # Step 3: Try expanded queries if not enough results
        if len(search_results) < top_k and len(expanded_queries) > 1:
            for eq in expanded_queries[1:]:
                more_results = self.hybrid.search(
                    query=eq,
                    paper_ids=paper_ids,
                    top_k=top_k - len(search_results),
                    use_reranker=False,
                )
                # Add unique results
                existing_ids = {r.chunk_id for r in search_results}
                for r in more_results:
                    if r.chunk_id not in existing_ids:
                        search_results.append(r)
                        existing_ids.add(r.chunk_id)

                if len(search_results) >= top_k:
                    break

        # Step 4: Build context
        chunks = []
        for r in search_results:
            chunks.append({
                "chunk_id": r.chunk_id,
                "paper_id": r.paper_id,
                "paper_title": r.paper_title,
                "content": r.content,
                "page_number": r.page_number,
                "score": r.score,
            })

        context_text = self._build_context(chunks)

        papers_used = list(set(c["paper_id"] for c in chunks))

        return RetrievalResult(
            chunks=chunks,
            context_text=context_text,
            total_chunks=len(chunks),
            papers_used=papers_used,
        )

    def _expand_query(self, query: str) -> list[str]:
        """
        Simple query expansion: generate alternative phrasings.

        Returns list of query variations.
        """
        # For MVP, just return the original query
        # Future: use LLM for query expansion
        return [query]

    def _build_context(self, chunks: list[dict]) -> str:
        """
        Build a context string from retrieved chunks.

        Each chunk is formatted with its source paper and page number
        for citation.
        """
        if not chunks:
            return ""

        parts = ["Dưới đây là các đoạn văn liên quan từ tài liệu:\n"]

        for i, chunk in enumerate(chunks, 1):
            source = f"[{chunk['paper_title']}]"
            if chunk.get("page_number"):
                source += f" (trang {chunk['page_number']})"

            parts.append(f"\n{source}\n{chunk['content'].strip()}\n")

        return "\n".join(parts)
