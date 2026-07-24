"""Format Auditor tool — thin wrapper on publishing.auditor with ToolResult interface."""

from __future__ import annotations

from .base import BaseTool, ToolResult


class FormatAuditorTool(BaseTool):
    """Runs a full venue-specific manuscript audit and returns a ToolResult.

    All audit checks are driven by venue_rules.json via publishing.auditor.
    No LLM is involved.
    """

    name = "format_auditor"

    def _run(  # type: ignore[override]
        self,
        title: str,
        text_content: str,
        venue_id: str = "ieee_trans",
        author_name: str = "",
    ) -> ToolResult:
        from academic.governance import get_academic_governance
        from publishing.auditor import audit_manuscript

        gov = get_academic_governance()
        gov.rules(("format_compliance",))

        audit = audit_manuscript(title, text_content, venue_id, author_name)

        success = audit.get("counts", {}).get("critical", 0) == 0
        return ToolResult(
            tool=self.name,
            success=success,
            data=audit,
            errors=[c["message"] for c in audit.get("checks", []) if c.get("severity") == "critical"],
            warnings=[c["message"] for c in audit.get("checks", []) if c.get("severity") == "warning"],
            provenance=audit.get("venue_info", {}).get("provenance", venue_id),
            governance_version=gov.version,
        )
