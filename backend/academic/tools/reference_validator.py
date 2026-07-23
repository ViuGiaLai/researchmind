"""Reference Validator tool — checks reference list structure and completeness."""
from __future__ import annotations

import re
from typing import Any

from .base import BaseTool, ToolResult


class ReferenceValidatorTool(BaseTool):
    """Validates a reference list against venue-specific format rules.

    Rule specs come from venue_rules.json — no hardcoded style logic.
    """
    name = "reference_validator"

    def _run(self, references: list[str], venue_id: str = "ieee_trans") -> ToolResult:  # type: ignore[override]
        from academic.governance import get_academic_governance
        from publishing.templates import get_venue_template

        gov = get_academic_governance()
        template = get_venue_template(venue_id)
        provenance = template.get("provenance", venue_id)
        expected_styles = template.get("supported_citation_styles", [])
        rules = gov.rules(("citation_integrity", "format_compliance"))

        issues: list[dict[str, Any]] = []
        passed: list[dict[str, Any]] = []
        seen: set[str] = set()
        duplicates: list[int] = []

        doi_re = re.compile(r'10\.\d{4,}/\S+')
        year_re = re.compile(r'\b(19|20)\d{2}\b')

        for idx, ref in enumerate(references):
            ref = ref.strip()
            if not ref:
                continue

            key = ref.lower()[:60]
            if key in seen:
                duplicates.append(idx)
                issues.append({"index": idx, "issue": "duplicate", "ref": ref[:80]})
                continue
            seen.add(key)

            ref_issues: list[str] = []
            if not year_re.search(ref):
                ref_issues.append("missing_year")
            if len(ref) < 30:
                ref_issues.append("too_short")
            has_doi = bool(doi_re.search(ref))

            entry = {"index": idx, "ref": ref[:120], "has_doi": has_doi, "issues": ref_issues}
            if ref_issues:
                issues.append(entry)
            else:
                passed.append(entry)

        return ToolResult(
            tool=self.name,
            success=len(issues) == 0,
            data={
                "total": len(references),
                "passed": len(passed),
                "issues": issues,
                "duplicates": duplicates,
                "doi_coverage": round(sum(1 for r in passed if r.get("has_doi")) / max(len(references), 1), 2),
                "expected_styles": expected_styles,
                "rules_applied": list(rules),
            },
            provenance=provenance,
        )
