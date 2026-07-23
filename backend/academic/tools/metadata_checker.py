"""Metadata Checker tool — validates manuscript metadata fields against venue rules."""
from __future__ import annotations

import re
from typing import Any

from .base import BaseTool, ToolResult


class MetadataCheckerTool(BaseTool):
    """Validates required metadata fields (keywords, ORCID, CCS, data availability, ethics, funding)
    against the venue's rules defined in venue_rules.json.
    """
    name = "metadata_checker"

    def _run(  # type: ignore[override]
        self,
        text_content: str,
        venue_id: str = "ieee_trans",
        metadata: dict[str, Any] | None = None,
    ) -> ToolResult:
        from academic.governance import get_academic_governance
        from publishing.templates import get_venue_template

        gov = get_academic_governance()
        template = get_venue_template(venue_id)
        rules_spec = template.get("metadata_rules", {})
        provenance = template.get("provenance", venue_id)

        meta = metadata or {}
        missing_fields: list[str] = []
        passed_fields: list[str] = []
        warnings: list[str] = []

        text_content.lower()

        # 1. Keywords
        if rules_spec.get("requires_keywords", False):
            has_keywords = bool(meta.get("keywords")) or bool(re.search(r"(?i)\b(keywords|index terms)\b", text_content))
            if has_keywords:
                passed_fields.append("keywords")
            else:
                missing_fields.append("keywords")
                warnings.append("Missing required 'Keywords' / 'Index Terms' section.")

        # 2. CCS Concepts (ACM)
        if rules_spec.get("requires_ccs", False):
            has_ccs = bool(meta.get("ccs_concepts")) or bool(re.search(r"(?i)\bccs\s*concepts?\b", text_content))
            if has_ccs:
                passed_fields.append("ccs_concepts")
            else:
                missing_fields.append("ccs_concepts")
                warnings.append("Missing required ACM CCS Concepts classification.")

        # 3. ORCID
        if rules_spec.get("requires_orcid", False):
            has_orcid = bool(meta.get("orcids")) or bool(re.search(r"0000-000[1-9]-\d{4}-\d{3}[\dX]", text_content))
            if has_orcid:
                passed_fields.append("orcid")
            else:
                missing_fields.append("orcid")
                warnings.append("Missing required ORCID iDs for authors.")

        # 4. Data Availability Statement
        if rules_spec.get("requires_data_availability", False):
            has_data_stmt = bool(meta.get("data_availability")) or bool(re.search(r"(?i)data\s+availability", text_content))
            if has_data_stmt:
                passed_fields.append("data_availability")
            else:
                missing_fields.append("data_availability")
                warnings.append("Missing required Data Availability Statement.")

        # 5. Ethics Statement
        if rules_spec.get("requires_ethics_statement", False):
            has_ethics = bool(meta.get("ethics_statement")) or bool(re.search(r"(?i)ethics\s+(statement|approval)", text_content))
            if has_ethics:
                passed_fields.append("ethics_statement")
            else:
                missing_fields.append("ethics_statement")
                warnings.append("Missing required Ethics Statement.")

        # 6. Funding Statement
        if rules_spec.get("requires_funding_statement", False):
            has_funding = bool(meta.get("funding")) or bool(re.search(r"(?i)(funding|acknowledg?ments?|financial\s+support)", text_content))
            if has_funding:
                passed_fields.append("funding_statement")
            else:
                missing_fields.append("funding_statement")
                warnings.append("Missing required Funding / Acknowledgments Statement.")

        # 7. Author Contributions
        if rules_spec.get("requires_author_contributions", False):
            has_contrib = bool(meta.get("author_contributions")) or bool(re.search(r"(?i)author\s+contributions", text_content))
            if has_contrib:
                passed_fields.append("author_contributions")
            else:
                missing_fields.append("author_contributions")
                warnings.append("Missing required Author Contributions Section.")

        # 8. Conflict of Interest
        if rules_spec.get("requires_conflict_of_interest", False):
            has_coi = bool(meta.get("conflict_of_interest")) or bool(re.search(r"(?i)(competing|conflict\s+of)\s+interests?", text_content))
            if has_coi:
                passed_fields.append("conflict_of_interest")
            else:
                missing_fields.append("conflict_of_interest")
                warnings.append("Missing required Conflict of Interest Statement.")

        success = len(missing_fields) == 0

        return ToolResult(
            tool=self.name,
            success=success,
            data={
                "venue_id": venue_id,
                "passed_fields": passed_fields,
                "missing_fields": missing_fields,
                "rules_spec": rules_spec,
            },
            warnings=warnings,
            provenance=provenance,
            governance_version=gov.version,
        )
