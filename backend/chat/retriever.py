"""RAG retrieval pipeline.

Takes a user query, runs hybrid search, postprocesses results,
builds context for LLM.

Postprocessors (llama_index-inspired):
- SimilarityPostprocessor: filter low-score chunks
- LongContextReorder: mitigate "lost in the middle"

MIT License — adapted from llama_index:
https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/postprocessor/node.py
"""

from typing import Optional
from dataclasses import dataclass
from loguru import logger

from search.postprocessor import (
    BaseNodePostprocessor,
    SimilarityPostprocessor,
    LongContextReorder,
)


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
    3. Postprocess results (similarity cutoff, lost-in-the-middle reorder)
    4. Context building
    """

    def __init__(
        self,
        hybrid_search,
        postprocessors: Optional[list[BaseNodePostprocessor]] = None,
    ):
        self.hybrid = hybrid_search
        from config.settings import settings
        cutoff = getattr(settings, "similarity_cutoff", 0.0)
        self.postprocessors = postprocessors or [
            SimilarityPostprocessor(similarity_cutoff=cutoff),
            LongContextReorder(),
        ]

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

        # Step 4: Postprocess results (similarity cutoff, lost-in-the-middle reorder)
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

        for pp in self.postprocessors:
            before = len(chunks)
            chunks = pp(chunks)
            if len(chunks) < before:
                logger.debug(f"Postprocessor {pp.__class__.__name__}: {before} → {len(chunks)} chunks")

        context_text = self._build_context(chunks, query)

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

    def _build_context(self, chunks: list[dict], query: Optional[str] = None) -> str:
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

            content = chunk['content'].strip()
            if query and len(content) > 350:
                content = self._compress_chunk_text(content, query)

            parts.append(f"\n{source}\n{content}\n")

        return "\n".join(parts)

    def _compress_chunk_text(self, content: str, query: str) -> str:
        """
        Compress text chunk by keeping only query-relevant sentences (sentence-level lexical compression).
        Saves tokens and accelerates local LLM prefill and inference speeds.
        """
        import re
        stop_words = {
            "và", "hoặc", "của", "cho", "trong", "ngoài", "là", "bởi", "tại", "với",
            "the", "and", "of", "to", "in", "for", "with", "on", "at", "by", "an", "is", "this", "that"
        }
        keywords = {w.lower() for w in re.findall(r"\w+", query) if len(w) > 1 and w.lower() not in stop_words}
        if not keywords:
            return content

        sentences = re.split(r'(?<=[.!?])\s+', content)
        if len(sentences) <= 3:
            return content

        keep = [False] * len(sentences)
        keep[0] = True
        keep[-1] = True

        for idx, sent in enumerate(sentences):
            sent_lower = sent.lower()
            if any(kw in sent_lower for kw in keywords):
                keep[idx] = True
                if idx > 0:
                    keep[idx - 1] = True
                if idx < len(sentences) - 1:
                    keep[idx + 1] = True

        compressed_parts = []
        skipped_last = False

        for idx, k in enumerate(keep):
            if k:
                compressed_parts.append(sentences[idx])
                skipped_last = False
            else:
                if not skipped_last:
                    compressed_parts.append("[...]")
                    skipped_last = True

        return " ".join(compressed_parts)
