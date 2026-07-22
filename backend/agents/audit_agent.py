"""Audit Agent — format compliance, metadata check, reference validation, and auto-fix."""
from __future__ import annotations
from typing import Any
from .base import BaseAgent, AgentContext, AgentResult
from loguru import logger


class AuditAgent(BaseAgent):
    """Runs format audit, metadata check, and auto-fix on manuscript text.

    Tools: format_auditor, metadata_checker, reference_validator, auto_fixer
    Workflow steps supported: audit, auto_fix
    """
    name = "audit_agent"
    allowed_tools = ("format_auditor", "metadata_checker", "reference_validator", "auto_fixer")

    async def run(self, ctx: AgentContext) -> AgentResult:
        from academic.governance import get_academic_governance
        gov = get_academic_governance()
        step = ctx.workflow_step or "audit"

        logger.info(f"AuditAgent handling step '{step}' for venue={ctx.venue_id}")
        try:
            if step == "audit":
                evidence = ctx.available_artifacts.get("evidence", "")
                text = evidence.get("context", "") if isinstance(evidence, dict) else str(evidence)
                title = ctx.available_artifacts.get("title", "Untitled Manuscript")

                auditor = self.get_tool("format_auditor")
                audit_result = auditor.run(title=title, text_content=text, venue_id=ctx.venue_id)

                meta_checker = self.get_tool("metadata_checker")
                meta_result = meta_checker.run(text_content=text, venue_id=ctx.venue_id)

                source_labels = evidence.get("source_labels", []) if isinstance(evidence, dict) else []
                evidence_gaps = audit_result.data.get("counts", {}).get("critical", 0) > 0

                return AgentResult(
                    agent=self.name,
                    step="audit",
                    success=True,
                    output={
                        "audit_report": audit_result.data,
                        "metadata_report": meta_result.data,
                        "source_labels": source_labels,
                        "evidence_gaps": evidence_gaps,
                    },
                    metadata={"governance_version": gov.version},
                )

            elif step == "auto_fix":
                audit_report = ctx.available_artifacts.get("audit_report", {})
                if isinstance(audit_report, dict) and "audit_report" in audit_report:
                    audit_report = audit_report["audit_report"]

                text = ctx.available_artifacts.get("text", "")
                if not text and isinstance(ctx.available_artifacts.get("evidence"), dict):
                    text = ctx.available_artifacts["evidence"].get("context", "")

                fixer = self.get_tool("auto_fixer")
                fix_result = fixer.run(text=str(text), audit_data=audit_report if isinstance(audit_report, dict) else {})

                return AgentResult(
                    agent=self.name,
                    step="auto_fix",
                    success=fix_result.success,
                    output={
                        "fixed_draft": fix_result.data.get("fixed_text", text),
                        "fixes_applied": fix_result.data.get("fixes_applied", []),
                    },
                    metadata={"governance_version": gov.version},
                )

            else:
                return AgentResult(
                    agent=self.name,
                    step=step,
                    success=False,
                    errors=[f"Unsupported step for AuditAgent: {step}"],
                )

        except Exception as exc:
            logger.error(f"AuditAgent error on step '{step}': {exc}")
            return AgentResult(
                agent=self.name, step=step, success=False, errors=[str(exc)]
            )
