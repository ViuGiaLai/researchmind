"""Research Agent — RAG retrieval, query parsing, claim analysis, and citation verification."""
from __future__ import annotations

from loguru import logger

from .base import AgentContext, AgentResult, BaseAgent


class ResearchAgent(BaseAgent):
    """Handles query parsing, evidence retrieval, claim analysis, and citation verification.

    Tools: citation_checker, doi_lookup
    Workflow steps supported: parse, retrieve, analyze, verify
    """
    name = "research_agent"
    allowed_tools = ("citation_checker", "doi_lookup")

    async def run(self, ctx: AgentContext) -> AgentResult:
        from academic.governance import get_academic_governance
        from app_state import state

        gov = get_academic_governance()
        step = ctx.workflow_step or "retrieve"
        logger.info(f"ResearchAgent handling step '{step}' for query: {ctx.query[:60]}")

        try:
            if step == "parse":
                # Parse query into intent and scope
                intent = "academic_research"
                scope = ctx.query.strip()
                return AgentResult(
                    agent=self.name,
                    step="parse",
                    success=True,
                    output={"intent": intent, "scope": scope},
                    metadata={"governance_version": gov.version},
                )

            elif step == "retrieve":
                # Retrieve document chunks using retriever
                retriever = getattr(state, "retriever", None)
                if retriever is None:
                    # Fallback context if retriever is not initialized in dry runs
                    context_text = f"[Evidence Context for: {ctx.query}]"
                    source_labels = ["Paper A, page 1"]
                else:
                    retrieval = retriever.retrieve(
                        ctx.query, paper_ids=ctx.paper_ids or None, top_k=8
                    )
                    context_text = retrieval.context_text
                    source_labels = [
                        c.get("label", "") for c in getattr(retrieval, "citations", [])
                    ]

                return AgentResult(
                    agent=self.name,
                    step="retrieve",
                    success=True,
                    output={"context": context_text, "source_labels": source_labels},
                    metadata={"governance_version": gov.version},
                )

            elif step == "analyze":
                # Analyze claims and extract source labels from evidence
                evidence = ctx.available_artifacts.get("evidence", "")
                evidence_text = evidence.get("context", "") if isinstance(evidence, dict) else str(evidence)
                source_labels = evidence.get("source_labels", []) if isinstance(evidence, dict) else []

                # Extract claims (bullet lines or sentences)
                claims = [line.strip() for line in evidence_text.splitlines() if line.strip() and not line.startswith("#")]
                return AgentResult(
                    agent=self.name,
                    step="analyze",
                    success=True,
                    output={"claims": claims[:10], "source_labels": source_labels},
                    metadata={"governance_version": gov.version},
                )

            elif step == "verify":
                # Run citation verification on source_labels / citations
                source_labels = ctx.available_artifacts.get("source_labels", [])
                if not source_labels and isinstance(ctx.available_artifacts.get("evidence"), dict):
                    source_labels = ctx.available_artifacts["evidence"].get("source_labels", [])

                checker = self.get_tool("citation_checker")
                check_result = checker.run(
                    citations=list(source_labels) if isinstance(source_labels, (list, tuple)) else [str(source_labels)],
                    venue_id=ctx.venue_id,
                )
                return AgentResult(
                    agent=self.name,
                    step="verify",
                    success=check_result.success,
                    output=check_result.data,
                    metadata={"governance_version": gov.version},
                )

            else:
                return AgentResult(
                    agent=self.name,
                    step=step,
                    success=False,
                    errors=[f"Unsupported step for ResearchAgent: {step}"],
                )

        except Exception as exc:
            logger.error(f"ResearchAgent error on step '{step}': {exc}")
            return AgentResult(
                agent=self.name, step=step, success=False, errors=[str(exc)]
            )
