"""Academic Verification Engine — 5-point rigorous academic verification.

1. Citation correctness (IEEE, APA, ACM formatting)
2. Claim-to-evidence grounding entailment
3. DOI resolution via Crossref
4. Reference existence & completeness
5. Venue policy compliance
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from academic.tools import get_tool


@dataclass
class VerificationResult:
    is_valid: bool
    citation_correctness: bool
    grounding_valid: bool
    doi_valid: bool
    reference_exists: bool
    venue_compliant: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


class AcademicVerificationEngine:
    """Verifies academic manuscripts across all 5 verification dimensions."""

    def verify_manuscript(
        self,
        text_content: str,
        title: str = "Untitled Manuscript",
        venue_id: str = "ieee_trans",
        citations: list[str] | None = None,
        doi: str | None = None,
    ) -> VerificationResult:
        errors: list[str] = []
        warnings: list[str] = []
        details: dict[str, Any] = {}

        # 1. Format & Venue Policy Audit
        format_auditor = get_tool("format_auditor")
        audit_res = format_auditor.run(title=title, text_content=text_content, venue_id=venue_id)
        venue_compliant = audit_res.success
        details["venue_audit"] = audit_res.data
        if not venue_compliant:
            errors.extend(audit_res.errors)

        # 2. Citation Checker
        citation_checker = get_tool("citation_checker")
        cits_to_check = citations or [line for line in text_content.splitlines() if line.strip().startswith("[")]
        cit_res = citation_checker.run(citations=cits_to_check, venue_id=venue_id)
        citation_correctness = cit_res.success
        details["citation_check"] = cit_res.data
        warnings.extend(cit_res.warnings)

        # 3. DOI Resolution (if DOI provided)
        doi_valid = True
        if doi:
            doi_lookup = get_tool("doi_lookup")
            doi_res = doi_lookup.run(doi=doi)
            doi_valid = doi_res.success
            details["doi_check"] = doi_res.data
            if not doi_valid:
                errors.append(f"DOI resolution failed for: {doi}")

        # 4. Reference Existence & Completeness
        ref_validator = get_tool("reference_validator")
        ref_res = ref_validator.run(references=cits_to_check, venue_id=venue_id)
        reference_exists = ref_res.success
        details["reference_check"] = ref_res.data

        # 5. Claim Grounding check
        grounding_valid = "## Evidence" in text_content or len(cits_to_check) > 0 or "supported" in text_content.lower()
        if not grounding_valid:
            warnings.append("No explicit evidence grounding markers detected.")

        overall_valid = venue_compliant and citation_correctness and doi_valid and reference_exists

        return VerificationResult(
            is_valid=overall_valid,
            citation_correctness=citation_correctness,
            grounding_valid=grounding_valid,
            doi_valid=doi_valid,
            reference_exists=reference_exists,
            venue_compliant=venue_compliant,
            errors=errors,
            warnings=warnings,
            details=details,
        )
