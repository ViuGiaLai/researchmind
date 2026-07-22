"""
ResearchMind VN — Knowledge Engine Orchestrator.

Combines Semantic Scholar, PapersWithCode, and OpenAlex to provide
deep SOTA benchmark context, citation influence metrics, and domain knowledge.
"""

from typing import Any
try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger("knowledge_engine")
from academic.semantic_scholar import get_paper_by_doi, search_papers as s2_search
from academic.openalex import search_openalex
from academic.paperswithcode import search_paper_results, search_tasks, get_task_benchmarks

class KnowledgeEngine:
    """Orchestrator for academic knowledge synthesis."""

    def __init__(self):
        pass

    def get_paper_knowledge(self, title: str, doi: str | None = None) -> dict[str, Any]:
        """Fetch comprehensive knowledge footprint for a paper."""
        res: dict[str, Any] = {
            "title": title,
            "doi": doi,
            "semantic_scholar": None,
            "openalex": None,
            "paperswithcode": [],
            "sota_benchmarks": [],
        }

        # 1. Semantic Scholar Lookup
        try:
            s2_paper = None
            if doi:
                s2_paper = get_paper_by_doi(doi)
            if not s2_paper and title:
                s2_matches = s2_search(title, limit=1)
                if s2_matches:
                    s2_paper = s2_matches[0]

            if s2_paper:
                res["semantic_scholar"] = {
                    "paper_id": s2_paper.paper_id,
                    "citation_count": s2_paper.citation_count,
                    "influential_citation_count": s2_paper.influential_citation_count,
                    "venue": s2_paper.venue,
                    "year": s2_paper.year,
                    "url": s2_paper.url,
                    "fields_of_study": s2_paper.fields_of_study,
                }
        except Exception as e:
            logger.warning(f"KnowledgeEngine S2 error: {e}")

        # 2. OpenAlex Lookup
        try:
            oa_results = search_openalex(title, limit=1)
            if oa_results:
                oa = oa_results[0]
                res["openalex"] = {
                    "id": oa.id,
                    "cited_by_count": oa.cited_by_count,
                    "fwci": oa.fwci,
                    "concepts": [c.get("display_name") for c in oa.concepts[:5] if isinstance(c, dict)],
                }
        except Exception as e:
            logger.warning(f"KnowledgeEngine OpenAlex error: {e}")

        # 3. PapersWithCode SOTA Benchmarks
        try:
            pwc_results = search_paper_results(title)
            res["paperswithcode"] = pwc_results
        except Exception as e:
            logger.warning(f"KnowledgeEngine PapersWithCode error: {e}")

        return res

    def build_sota_prompt_context(self, paper_summaries: list[dict[str, Any]]) -> str:
        """Format SOTA knowledge into a structured prompt section for AI reasoning."""
        if not paper_summaries:
            return ""

        lines = ["\n=== EXTERNAL SOTA BENCHMARKS & KNOWLEDGE ENGINE ==="]
        for p in paper_summaries:
            title = p.get("title", "Untitled")
            lines.append(f"\nPaper: {title}")
            
            s2 = p.get("semantic_scholar")
            if s2:
                lines.append(f"  - Citations: {s2.get('citation_count', 0)} (Influential: {s2.get('influential_citation_count', 0)})")
                if s2.get("venue"):
                    lines.append(f"  - Venue: {s2.get('venue')}")

            oa = p.get("openalex")
            if oa and oa.get("concepts"):
                lines.append(f"  - Field Concepts: {', '.join(oa['concepts'])}")

            pwc = p.get("paperswithcode", [])
            for pw in pwc:
                results = pw.get("results", [])
                for r in results:
                    task = r.get("task")
                    metric = r.get("metric")
                    val = r.get("value")
                    rank = r.get("rank")
                    rank_str = f" (Rank #{rank})" if rank else ""
                    lines.append(f"  - SOTA Evaluation: Task '{task}' | {metric} = {val}{rank_str}")

        lines.append("=== END KNOWLEDGE ENGINE ===\n")
        return "\n".join(lines)


knowledge_engine = KnowledgeEngine()
