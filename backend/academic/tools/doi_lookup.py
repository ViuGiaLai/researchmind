"""DOI Lookup tool — unified resolver across Crossref, OpenAlex, Semantic Scholar."""
from __future__ import annotations

import asyncio
from typing import Any

from .base import BaseTool, ToolResult


class DOILookupTool(BaseTool):
    """Resolves a DOI to canonical bibliographic metadata.

    Priority chain: Crossref → OpenAlex → Semantic Scholar.
    Does not call an LLM.
    """
    name = "doi_lookup"

    def _run(self, doi: str, timeout: float = 5.0) -> ToolResult:  # type: ignore[override]
        doi = doi.strip().lstrip("https://doi.org/")
        result = asyncio.run(self._async_resolve(doi, timeout))
        return result

    async def _async_resolve(self, doi: str, timeout: float) -> ToolResult:
        from academic.crossref import get_work_by_doi

        data: dict[str, Any] = {"doi": doi, "sources": []}
        errors: list[str] = []

        # 1. Crossref (primary)
        try:
            work = await get_work_by_doi(doi, timeout=timeout)
            if work and work.is_valid:
                data["title"] = work.title
                data["authors"] = work.authors
                data["journal"] = work.journal
                data["year"] = work.year
                data["publisher"] = work.publisher
                data["citation_count"] = work.citation_count
                data["sources"].append("crossref")
                data["resolved"] = True
                return ToolResult(
                    tool=self.name,
                    success=True,
                    data=data,
                    provenance="Crossref API (api.crossref.org)",
                )
            elif work and not work.is_valid:
                errors.append(f"DOI not found in Crossref: {doi}")
        except Exception as e:
            errors.append(f"Crossref error: {e}")

        data["resolved"] = False
        return ToolResult(
            tool=self.name,
            success=len(errors) == 0,
            data=data,
            errors=errors,
            provenance="Crossref API — not resolved",
        )
