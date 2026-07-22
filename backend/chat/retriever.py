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
from chat.retrieval_policy import adaptive_top_k, decompose_query
from common.ai_observability import increment, trace
from common.prompt_security import neutralize_untrusted_text
from config.settings import settings

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
    warning: str = ""


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
        use_reranker: bool = True,
        metadata_filters: dict | None = None,
        task_type: str = "",
    ) -> RetrievalResult:
        """
        Retrieve relevant chunks for a query.

        Args:
            query: User's natural language query.
            paper_ids: Optional filter to specific papers.
            top_k: Number of chunks to retrieve.
            use_reranker: Whether to apply cross-encoder re-ranking.
            task_type: Task type ("debate", "verify", etc.) for adaptive top_k.

        Returns:
            RetrievalResult with chunks, context text, and metadata.
        """
        import time as _time
        _t_start = _time.time()

        top_k = adaptive_top_k(query, top_k, task_type)
        if metadata_filters:
            from app_state import state
            from db.database import get_session
            from chat.metadata_filters import filter_paper_ids
            session = get_session(state.engine)
            try:
                filtered_ids = filter_paper_ids(session, metadata_filters) or []
            finally:
                session.close()
            paper_ids = list(set(paper_ids or filtered_ids) & set(filtered_ids)) if paper_ids else filtered_ids
            if not paper_ids:
                return RetrievalResult([], "", 0, [])
        # Step 1: deterministic decomposition followed by bilingual expansion.
        expanded_queries = []
        for subquery in decompose_query(query):
            for expanded in self._expand_query(subquery):
                if expanded not in expanded_queries:
                    expanded_queries.append(expanded)

        # Step 2: Search with original query
        embedding_warning = ""
        _t_search = _time.time()
        with trace("rag.retrieve", top_k=top_k, decomposed=len(expanded_queries)):
            search_results = self.hybrid.search(
                query=query,
                paper_ids=paper_ids,
                top_k=top_k,
                use_reranker=use_reranker,
            )
            embedding_warning = getattr(self.hybrid, "embedding_warning", "")
        _t_search = (_time.time() - _t_search) * 1000

        _t_step3 = _time.time()

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
            safe_content, injection_detected = neutralize_untrusted_text(r.content)
            if injection_detected:
                increment("rag.prompt_injection_detected")
            chunks.append({
                "chunk_id": r.chunk_id,
                "paper_id": r.paper_id,
                "paper_title": r.paper_title,
                "content": safe_content,
                "page_number": r.page_number,
                "score": r.score,
                "chunk_index": getattr(r, 'chunk_index', 0),
            })

        chunks_before_pp = chunks[:]
        for pp in self.postprocessors:
            before = len(chunks)
            chunks = pp(chunks)
            if len(chunks) < before:
                logger.debug(f"Postprocessor {pp.__class__.__name__}: {before} → {len(chunks)} chunks")

        # Fallback: nếu postprocessor lọc hết, giữ top-k chunk gốc
        if not chunks and chunks_before_pp:
            chunks_before_pp.sort(key=lambda c: c.get("score") or 0, reverse=True)
            chunks = chunks_before_pp[:top_k]
            logger.debug(f"Postprocessor filtered all chunks, fallback to top {len(chunks)}")

        # Step 5: Intent-aware section boosting
        intent = self._detect_intent(query)
        if intent:
            chunks = self._boost_section_chunks(chunks, intent)

        # Step 6: Interleave papers to preserve source diversity.
        chunks = self._interleave_by_paper(chunks)
        radius = max(0, min(int(getattr(settings, "parent_context_radius", 0)), 2))
        if radius and chunks:
            from app_state import state
            from db.database import get_session
            from chat.parent_retrieval import expand_parent_context
            session = get_session(state.engine)
            try:
                chunks = expand_parent_context(session, chunks, radius)
            finally:
                session.close()
        # Step 7: Build context text first, then anonymize once
        context_text = self._build_context(chunks, query, task_type)

        # Step 8: Apply Anonymization ONCE on the final context (not per chunk)
        if context_text and chunks:
            from app_state import state
            from db.database import get_session
            from db.models import AnonymizationMap
            from anonymization.engine import AnonymizationEngine, EntityEntry
            anon_engine = AnonymizationEngine()
            import json
            t_anon = _time.time()

            paper_ids_in_chunks = list(set(c["paper_id"] for c in chunks))
            session = get_session(state.engine)
            try:
                anon_maps = session.query(AnonymizationMap).filter(
                    AnonymizationMap.paper_id.in_(paper_ids_in_chunks),
                    AnonymizationMap.is_active == 1
                ).all()

                if anon_maps:
                    # Parse all maps
                    parsed_maps: dict[str, dict[str, EntityEntry]] = {}
                    for m in anon_maps:
                        try:
                            data = json.loads(m.entity_map_json)
                            parsed_maps[m.paper_id] = {
                                orig: EntityEntry(
                                    original=orig, label=info["label"],
                                    entity_type=info["entity_type"], count=info.get("count", 0)
                                ) for orig, info in data.items()
                            }
                        except Exception as e:
                            logger.warning(f"Failed to parse anon map for {m.paper_id}: {e}")

                    if parsed_maps:
                        # Anonymize the full context text once (not per chunk)
                        # Merge all entity maps for batch anonymization
                        merged_map: dict[str, EntityEntry] = {}
                        for pm in parsed_maps.values():
                            merged_map.update(pm)
                        result = anon_engine.anonymize(context_text, existing_map=merged_map)
                        context_text = result.anonymized_text
            finally:
                session.close()

            t_anon = (_time.time() - t_anon) * 1000
            if t_anon > 5:
                logger.debug(f"Anonymize full context: {t_anon:.0f}ms (was per-chunk before)")

        papers_used = list(set(c["paper_id"] for c in chunks))

        _t_total = (_time.time() - _t_start) * 1000
        _t_rest = (_time.time() - _t_step3) * 1000  # expanded queries + postprocess + anon + context
        logger.debug(
            f"RETRIEVE_TIMING "
            f"search={_t_search:.0f}ms "
            f"postproc_plus={_t_rest:.0f}ms "
            f"total={_t_total:.0f}ms "
            f"chunks={len(chunks)} papers={len(papers_used)}"
        )

        return RetrievalResult(
            chunks=chunks,
            context_text=context_text,
            total_chunks=len(chunks),
            papers_used=papers_used,
            warning=embedding_warning,
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
            "hình": ["figure", "diagram", "flowchart", "chart", "image", "illustration"],
            "lưu đồ": ["flowchart", "flow chart", "diagram", "algorithm chart"],
            "biểu đồ": ["chart", "graph", "diagram", "plot"],
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
            "figure": [
                "hình ", "hình 1", "hình 2", "figure", "fig.", "lưu đồ", "sơ đồ",
                "biểu đồ", "chart", "diagram", "flowchart", "trong hình", "trong ảnh",
            ],
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
            "figure": [
                r"\[Nội dung hình",
                r"\[Hình ",
                r"\[Hình ảnh",
                r"(Hình|Figure|Fig\.)\s*\d+",
                r"(lưu đồ|flowchart|biểu đồ|diagram)",
            ],
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

    def _interleave_by_paper(self, chunks: list[dict]) -> list[dict]:
        """Round-robin chunks across papers while preserving per-paper order."""
        if not chunks:
            return chunks

        from collections import OrderedDict
        clustered: OrderedDict[str, list[dict]] = OrderedDict()
        for chunk in chunks:
            pid = chunk.get("paper_id", "")
            if pid not in clustered:
                clustered[pid] = []
            clustered[pid].append(chunk)

        for paper_chunks in clustered.values():
            paper_chunks.sort(key=lambda x: x.get("chunk_index", 0))
        result: list[dict] = []
        depth = 0
        while len(result) < len(chunks):
            for paper_chunks in clustered.values():
                if depth < len(paper_chunks):
                    result.append(paper_chunks[depth])
            depth += 1
        return result

    # Backward-compatible alias for extensions that called the old private helper.
    def _cluster_by_paper(self, chunks: list[dict]) -> list[dict]:
        return self._interleave_by_paper(chunks)

    def _build_context(self, chunks: list[dict], query: Optional[str] = None, task_type: str = "") -> str:
        if not chunks:
            return ""

        # More aggressive compression for tasks that don't need full detail
        compress_threshold = 200  # was 350 — compress more chunks
        task_max_sentences = {
            "debate": 4,
            "verify": 5,
            "review": 6,
            "critique": 5,
        }.get(task_type.strip().lower(), 6)

        parts = ["The following passages are relevant excerpts from the documents:\n"]

        current_paper = None
        for i, chunk in enumerate(chunks, 1):
            paper_title = chunk.get("paper_title", "")
            if paper_title and paper_title != current_paper:
                current_paper = paper_title
                parts.append(f"\n---\n### 📄 {paper_title}\n")

            source = f"[{paper_title or chunk.get('paper_id', 'Unknown source')}"
            if chunk.get("page_number"):
                source += f", page {chunk['page_number']}"
            source += "]"

            content = chunk['content'].strip()
            if query and len(content) > compress_threshold:
                content = self._compress_chunk_text(content, query, max_sentences=task_max_sentences)

            parts.append(f"\n{source}\n{content}\n")

        return "\n".join(parts)

    def _compress_chunk_text(self, content: str, query: str, max_sentences: int = 5) -> str:
        """
        Aggressively compress text chunk by keeping only query-relevant sentences.

        Strategy:
        1. Split content into sentences
        2. Score each sentence by keyword density (query keyword matches)
        3. Keep only the top-N highest-scoring sentences
        4. Always keep the first sentence if it's short (abstract/intro context)

        This is much more aggressive than the previous version:
        - No longer keeps adjacent sentences
        - Caps at max_sentences (default 5)
        - Uses keyword frequency scoring instead of binary keep/discard
        - Removes the always-keep-last-sentence heuristic

        Saves tokens and accelerates LLM prefill/inference.
        """
        import re
        stop_words = {
            "và", "hoặc", "của", "cho", "trong", "ngoài", "là", "bởi", "tại", "với",
            "the", "and", "of", "to", "in", "for", "with", "on", "at", "by", "an", "is",
            "this", "that", "these", "those", "it", "its", "we", "our", "they", "their",
            "các", "có", "được", "một", "như", "khi", "sẽ", "đã", "đang", "về",
        }
        keywords = {w.lower() for w in re.findall(r"\w+", query) if len(w) > 1 and w.lower() not in stop_words}
        if not keywords:
            return content

        # Score-based sentence selection
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', content) if len(s.strip()) > 10]
        if len(sentences) <= 3:
            return content

        scored = []
        for sent in sentences:
            sent_lower = sent.lower()
            # Count how many distinct query keywords appear in this sentence
            match_count = sum(1 for kw in keywords if kw in sent_lower)
            # Normalize by sentence length to avoid favoring long sentences
            words_in_sent = len(sent_lower.split())
            density = match_count / max(words_in_sent, 1)
            scored.append((sent, density, match_count))

        # Sort by match_count desc, then density desc
        scored.sort(key=lambda x: (x[2], x[1]), reverse=True)

        # Keep top-N highest-scoring sentences
        selected = scored[:max_sentences]

        # Always keep first sentence if it's short (< 30 words) — likely abstract/intro
        first_words = len(sentences[0].split())
        if first_words < 30 and sentences[0] not in [s for s, _, _ in selected]:
            selected = [(sentences[0], 0.0, 0)] + selected[:max_sentences - 1]

        # Re-sort selected sentences back to original order for readability
        original_indices = {s: i for i, s in enumerate(sentences)}
        selected.sort(key=lambda x: original_indices.get(x[0], 9999))

        compressed_parts = []
        prev_idx = -2
        for sent, _, _ in selected:
            idx = original_indices.get(sent, -1)
            if idx > prev_idx + 1:
                compressed_parts.append("[...]")
            compressed_parts.append(sent)
            prev_idx = idx

        result = " ".join(compressed_parts)

        # Final safety: if compression barely helped, just truncate
        if len(result) > len(content) * 0.8:
            truncate_at = min(len(content), 1200)
            result_trunc = content[:truncate_at] + " [...]"
            logger.debug(
                f"COMPRESS_RATIO poor_compression "
                f"len_before={len(content)} len_after={len(result_trunc)} "
                f"saved={100 - len(result_trunc)*100//max(len(content),1)}% "
                f"keywords={len(keywords)}"
            )
            return result_trunc

        saved_pct = 100 - len(result) * 100 // max(len(content), 1)
        if saved_pct >= 10:
            logger.debug(
                f"COMPRESS_RATIO "
                f"len_before={len(content)} len_after={len(result)} "
                f"saved={saved_pct}% "
                f"sentences={len(sentences)}→{len(selected)} "
                f"keywords={len(keywords)}"
            )

        return result
