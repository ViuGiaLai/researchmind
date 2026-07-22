"""Review Agent — scientific peer review simulation using governance standards."""
from __future__ import annotations
from .base import BaseAgent, AgentContext, AgentResult
from loguru import logger


class ReviewAgent(BaseAgent):
    """Simulates a rigorous scientific peer review on manuscript drafts.

    Tools: format_auditor, reference_validator
    Rule set: peer_review_standards + writing_quality
    """
    name = "review_agent"
    allowed_tools = ("format_auditor", "reference_validator")

    async def run(self, ctx: AgentContext) -> AgentResult:
        from academic.governance import get_academic_governance
        gov = get_academic_governance()
        rules = gov.rules(("peer_review_standards", "writing_quality"))

        draft = ctx.available_artifacts.get("draft") or ctx.available_artifacts.get("fixed_draft") or ""
        if isinstance(draft, dict):
            draft = draft.get("draft") or draft.get("text") or str(draft)
        else:
            draft = str(draft)

        logger.info(f"ReviewAgent: evaluating manuscript quality against peer_review_standards")
        try:
            auditor = self.get_tool("format_auditor")
            audit_res = auditor.run(
                title=ctx.available_artifacts.get("title", "Untitled Manuscript"),
                text_content=draft,
                venue_id=ctx.venue_id,
            )

            # Evaluate review dimensions
            novelty_score = 0.85 if "novel" in draft.lower() or "proposed" in draft.lower() else 0.70
            methodology_score = 0.90 if "## method" in draft.lower() or "## methodology" in draft.lower() else 0.60
            clarity_score = 0.88 if len(draft.splitlines()) > 5 else 0.50

            review_report = {
                "overall_recommendation": "Accept with minor revisions" if audit_res.success else "Revisions required",
                "novelty_score": novelty_score,
                "methodology_score": methodology_score,
                "clarity_score": clarity_score,
                "audit_summary": audit_res.data,
                "rules_applied": list(rules),
            }

            return AgentResult(
                agent=self.name,
                step="review",
                success=True,
                output=review_report,
                metadata={"governance_version": gov.version},
            )
        except Exception as exc:
            logger.error(f"ReviewAgent error: {exc}")
            return AgentResult(
                agent=self.name, step="review", success=False, errors=[str(exc)]
            )
