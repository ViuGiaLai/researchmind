"""Publishing Agent — venue compliance check and export."""
from __future__ import annotations

from loguru import logger

from .base import AgentContext, AgentResult, BaseAgent


class PublishingAgent(BaseAgent):
    """Final compliance check and format export.

    Tools: format_auditor, exporter
    Rule set: format_compliance + peer_review_standards
    """
    name = "publishing_agent"
    allowed_tools = ("format_auditor", "exporter")

    async def run(self, ctx: AgentContext) -> AgentResult:
        from academic.governance import get_academic_governance
        gov = get_academic_governance()
        rules = gov.rules(("format_compliance", "peer_review_standards"))

        # Look for draft or fixed_draft in artifacts
        draft = ctx.available_artifacts.get("draft") or ctx.available_artifacts.get("fixed_draft") or ""
        title = ctx.available_artifacts.get("title", "Untitled Manuscript")

        if isinstance(draft, dict):
            draft = draft.get("draft") or draft.get("fixed_draft") or draft.get("text") or str(draft)
        else:
            draft = str(draft)

        logger.info(f"PublishingAgent: final compliance check and export for venue={ctx.venue_id}")
        try:
            auditor = self.get_tool("format_auditor")
            audit_res = auditor.run(title=title, text_content=draft, venue_id=ctx.venue_id)

            exporter = self.get_tool("exporter")
            export_res = exporter.run(
                content=draft,
                export_format="latex",
                venue_id=ctx.venue_id,
                title=title,
            )

            return AgentResult(
                agent=self.name,
                step="export",
                success=audit_res.success and export_res.success,
                output={
                    "audit_report": audit_res.data,
                    "artifact": export_res.data,
                    "ready_for_export": audit_res.success,
                },
                errors=audit_res.errors + export_res.errors,
                metadata={
                    "governance_version": gov.version,
                    "rules_applied": list(rules),
                    "venue_id": ctx.venue_id,
                },
            )
        except Exception as exc:
            logger.error(f"PublishingAgent error: {exc}")
            return AgentResult(
                agent=self.name, step="export", success=False, errors=[str(exc)]
            )
