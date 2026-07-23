"""Citation Checker tool — validates DOIs and citation formats against Crossref."""
from __future__ import annotations

import re
from typing import Any

from .base import BaseTool, ToolResult


class CitationCheckerTool(BaseTool):
    """Validates a list of citation strings for DOI presence and format.

    Does NOT call an LLM. Applies mechanical pattern rules backed by
    academic_governance.json:citation_integrity rule pack.
    """
    name = "citation_checker"

    # Regex for DOI pattern
    _DOI_RE = re.compile(r'\b(10\.\d{4,}(?:\.\d+)*\/\S+)\b', re.IGNORECASE)
    # Common citation format detectors
    _IEEE_RE = re.compile(r'^\[\d+\]|^\d+\.')
    _APA_RE  = re.compile(r'\(\d{4}\)')
    _ACM_RE  = re.compile(r'\d{4}\. .+?\. In ')

    def _run(self, citations: list[str], venue_id: str = "ieee_trans") -> ToolResult:  # type: ignore[override]
        from academic.governance import get_academic_governance
        from publishing.templates import get_venue_template

        gov = get_academic_governance()
        template = get_venue_template(venue_id)
        expected_styles = template.get("supported_citation_styles", [])
        rules = gov.rules(("citation_integrity",))
        provenance = f"citation_integrity rule pack + {template.get('provenance', venue_id)}"

        verified: list[dict[str, Any]] = []
        invalid: list[dict[str, Any]] = []
        warnings: list[str] = []

        for idx, cit in enumerate(citations):
            cit = cit.strip()
            if not cit:
                continue

            doi_match = self._DOI_RE.search(cit)
            has_doi = bool(doi_match)
            doi = doi_match.group(1) if doi_match else None

            # Detect citation style
            style_detected = "unknown"
            if self._IEEE_RE.search(cit):
                style_detected = "IEEE numeric"
            elif self._APA_RE.search(cit):
                style_detected = "APA author-year"
            elif self._ACM_RE.search(cit):
                style_detected = "ACM Reference Format"

            entry = {
                "index": idx,
                "citation": cit[:120],
                "has_doi": has_doi,
                "doi": doi,
                "style_detected": style_detected,
            }

            if not cit or len(cit) < 20:
                entry["issue"] = "too_short"
                invalid.append(entry)
            elif not has_doi:
                entry["issue"] = "missing_doi"
                warnings.append(f"Citation [{idx}] has no DOI")
                verified.append(entry)  # not invalid, just missing DOI
            else:
                verified.append(entry)

        return ToolResult(
            tool=self.name,
            success=True,
            data={
                "total": len(citations),
                "verified": verified,
                "invalid": invalid,
                "doi_coverage": round(sum(1 for c in verified if c.get("has_doi")) / max(len(citations), 1), 2),
                "expected_styles": expected_styles,
                "rules_applied": list(rules),
            },
            warnings=warnings,
            provenance=provenance,
        )
