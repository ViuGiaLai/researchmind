"""Continuous Academic Knowledge Sync — multi-source sync engine across OpenAlex, Crossref, Semantic Scholar, Venue Guidelines, and Taxonomy.
"""
from __future__ import annotations
import asyncio
import time
from typing import Any
from loguru import logger

from academic.crossref import get_work_by_doi as crossref_get_work
from academic.openalex import search_works as openalex_search_works
from academic.semantic_scholar import get_paper_by_doi as s2_get_paper
from publishing.guideline_fetcher import check_all_venue_updates


class ContinuousAcademicKnowledgeSync:
    """Multi-source continuous knowledge sync engine."""

    async def sync_paper_knowledge(self, doi: str) -> dict[str, Any]:
        """Sync paper metadata across Crossref, OpenAlex, and Semantic Scholar concurrently."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        doi_clean = doi.strip().lstrip("https://doi.org/")

        logger.info(f"Syncing paper knowledge for DOI: {doi_clean}")
        results: dict[str, Any] = {
            "doi": doi_clean,
            "synced_at": timestamp,
            "crossref": None,
            "openalex": None,
            "semantic_scholar": None,
        }

        # 1. Crossref lookup
        try:
            work = await crossref_get_work(doi_clean)
            if work and work.is_valid:
                results["crossref"] = {
                    "title": work.title,
                    "authors": work.authors,
                    "journal": work.journal,
                    "year": work.year,
                    "publisher": work.publisher,
                }
        except Exception as exc:
            logger.warning(f"KnowledgeSync Crossref error: {exc}")

        # 2. OpenAlex lookup
        try:
            oa_items = await openalex_search_works(doi_clean, limit=1)
            if oa_items:
                oa = oa_items[0]
                results["openalex"] = {
                    "id": oa.get("id"),
                    "title": oa.get("title"),
                    "cited_by_count": oa.get("cited_by_count", 0),
                }
        except Exception as exc:
            logger.warning(f"KnowledgeSync OpenAlex error: {exc}")

        # 3. Semantic Scholar lookup
        try:
            s2 = s2_get_paper(doi_clean)
            if s2:
                results["semantic_scholar"] = {
                    "paper_id": s2.paper_id,
                    "citation_count": s2.citation_count,
                    "venue": s2.venue,
                    "year": s2.year,
                }
        except Exception as exc:
            logger.warning(f"KnowledgeSync Semantic Scholar error: {exc}")

        return results

    def sync_venue_guidelines_and_taxonomy(self) -> dict[str, Any]:
        """Sync venue guidelines and return status report."""
        return check_all_venue_updates()


academic_knowledge_sync = ContinuousAcademicKnowledgeSync()
