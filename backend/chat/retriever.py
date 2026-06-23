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
                "chunk_index": getattr(r, 'chunk_index', 0),
            })

        for pp in self.postprocessors:
            before = len(chunks)
            chunks = pp(chunks)
            if len(chunks) < before:
                logger.debug(f"Postprocessor {pp.__class__.__name__}: {before} → {len(chunks)} chunks")

        # Step 5: Intent-aware section boosting
        intent = self._detect_intent(query)
        if intent:
            chunks = self._boost_section_chunks(chunks, intent)

        # Step 6: Cluster by paper (interleave chunks from same paper)
        chunks = self._cluster_by_paper(chunks)

        context_text = self._build_context(chunks, query)

        papers_used = list(set(c["paper_id"] for c in chunks))

        return RetrievalResult(
            chunks=chunks,
            context_text=context_text,
            total_chunks=len(chunks),
            papers_used=papers_used,
        )

    def _expand_query(self, query: str) -> list[str]:
        expansions = [query]

        vietnamese_patterns = {
            "điểm mạnh": ["advantages", "strengths", "pros", "ưu điểm", "lợi thế"],
            "điểm yếu": ["disadvantages", "weaknesses", "cons", "nhược điểm", "hạn chế"],
            "so sánh": ["comparison", "compare", "contrast", "versus", "vs"],
            "phương pháp": ["method", "approach", "technique", "methodology", "cách tiếp cận"],
            "ưu điểm": ["advantages", "benefits", "strengths", "pros"],
            "nhược điểm": ["disadvantages", "drawbacks", "weaknesses", "limitations", "cons"],
            "kết quả": ["results", "findings", "outcomes", "hiệu quả"],
            "khó khăn": ["challenges", "difficulties", "problems", "issues"],
            "hạn chế": ["limitations", "restrictions", "drawbacks", "shortcomings"],
            "hiệu quả": ["effectiveness", "efficiency", "performance", "efficacy"],
            "ứng dụng": ["application", "implementation", "deployment", "áp dụng"],
            "đánh giá": ["evaluation", "assessment", "analysis", "review"],
            "khác nhau": ["differences", "different", "distinctions", "khác biệt"],
            "tương tự": ["similar", "similarities", "comparable", "tương đồng"],
            "cải tiến": ["improvement", "enhancement", "innovation", "cải thiện"],
        }

        query_lower = query.lower()
        extra_terms = []
        for vn_word, en_syns in vietnamese_patterns.items():
            if vn_word in query_lower:
                extra_terms.extend(en_syns)

        if extra_terms:
            expansions.append(f"{query} {' '.join(extra_terms)}")
            expansions.append(" ".join(extra_terms))

        return expansions

    def _detect_intent(self, query: str) -> Optional[str]:
        query_lower = query.lower()
        intent_keywords = {
            "comparison": ["so sánh", "compare", "comparison", "versus", "vs", "khác nhau", "khác biệt", "tương tự", "tương đồng"],
            "strength_weakness": ["điểm mạnh", "điểm yếu", "ưu điểm", "nhược điểm", "advantages", "disadvantages", "strengths", "weaknesses", "pros", "cons"],
            "limitation": ["hạn chế", "limitation", "drawback", "khó khăn", "challenge", "bất lợi"],
            "result": ["kết quả", "result", "finding", "outcome", "hiệu quả"],
            "method": ["phương pháp", "method", "approach", "technique", "cách tiếp cận", "giải pháp"],
            "evaluation": ["đánh giá", "evaluation", "assessment", "hiệu quả", "performance", "effectiveness"],
        }
        for intent, keywords in intent_keywords.items():
            if any(kw in query_lower for kw in keywords):
                return intent
        return None

    def _boost_section_chunks(self, chunks: list[dict], intent: str) -> list[dict]:
        section_patterns = {
            "comparison": [r"(so sánh|comparison|contrast|khác biệt)", r"(bàn luận|discussion)"],
            "strength_weakness": [r"(ưu điểm|nhược điểm|advantages|disadvantages|pros|cons)", r"(đánh giá|evaluation)"],
            "limitation": [r"(hạn chế|limitation|drawback)", r"(kết luận|conclusion)", r"(bàn luận|discussion)"],
            "result": [r"(kết quả|result|finding)", r"(bàn luận|discussion)", r"(thảo luận)"],
            "method": [r"(phương pháp|method|approach)", r"(giới thiệu|introduction)"],
            "evaluation": [r"(đánh giá|evaluation|assessment)", r"(kết quả|result)"],
        }

        patterns = section_patterns.get(intent, [])
        if not patterns:
            return chunks

        import re
        boosted = []
        for chunk in chunks:
            content_lower = chunk["content"].lower()
            boost = 0.0
            for pat in patterns:
                if re.search(pat, content_lower):
                    boost = max(boost, 0.15)
            if boost > 0:
                chunk["score"] = chunk["score"] * (1.0 + boost)
            boosted.append(chunk)

        boosted.sort(key=lambda x: x["score"], reverse=True)
        return boosted

    def _cluster_by_paper(self, chunks: list[dict]) -> list[dict]:
        if not chunks:
            return chunks

        from collections import OrderedDict
        clustered: OrderedDict[str, list[dict]] = OrderedDict()
        for chunk in chunks:
            pid = chunk.get("paper_id", "")
            if pid not in clustered:
                clustered[pid] = []
            clustered[pid].append(chunk)

        result = []
        for pid, paper_chunks in clustered.items():
            paper_chunks.sort(key=lambda x: x.get("chunk_index", 0))
            result.extend(paper_chunks)

        return result

    def _build_context(self, chunks: list[dict], query: Optional[str] = None) -> str:
        if not chunks:
            return ""

        parts = ["Dưới đây là các đoạn văn liên quan từ tài liệu:\n"]

        current_paper = None
        for i, chunk in enumerate(chunks, 1):
            paper_title = chunk.get("paper_title", "")
            if paper_title and paper_title != current_paper:
                current_paper = paper_title
                parts.append(f"\n---\n### 📄 {paper_title}\n")

            source = f"[{paper_title}]"
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
