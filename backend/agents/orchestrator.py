"""Master Agent Orchestrator — routes workflow steps to specialized agents with full observability & evaluation.

Each workflow step declared in academic_governance.json maps to an agent.
Pipeline runs are logged to audit_trail.jsonl and automatically evaluated.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from loguru import logger

from common.audit_trail import AuditTrailRecord, audit_trail_logger
from evaluation.platform_evaluator import EvaluationMetrics, evaluate_pipeline_result

from .audit_agent import AuditAgent
from .base import AgentContext, AgentResult, BaseAgent
from .publishing_agent import PublishingAgent
from .research_agent import ResearchAgent
from .review_agent import ReviewAgent
from .writing_agent import WritingAgent

# Step → Agent mapping (data-driven)
_STEP_AGENT_MAP: dict[str, type[BaseAgent]] = {
    "parse": ResearchAgent,
    "retrieve": ResearchAgent,
    "analyze": ResearchAgent,
    "audit": AuditAgent,
    "verify": ResearchAgent,
    "auto_fix": AuditAgent,
    "synthesize": WritingAgent,
    "review": ReviewAgent,
    "export": PublishingAgent,
}


@dataclass
class PipelineResult:
    """Result of a full pipeline run."""

    query: str
    venue_id: str
    governance_version: str
    trace_id: str = ""
    steps: list[AgentResult] = field(default_factory=list)
    final_output: Any = None
    evaluation: EvaluationMetrics | None = None
    success: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "query": self.query,
            "venue_id": self.venue_id,
            "governance_version": self.governance_version,
            "steps": [s.to_dict() for s in self.steps],
            "final_output": self.final_output,
            "evaluation": self.evaluation.to_dict() if self.evaluation else None,
            "success": self.success,
        }


async def run_pipeline(
    query: str,
    paper_ids: list[str] | None = None,
    venue_id: str = "ieee_trans",
    language: str = "en",
    extra_artifacts: dict[str, Any] | None = None,
) -> PipelineResult:
    """Run the full research pipeline using the governance-defined workflow.

    Each step is executed, audited, and logged. Overall execution quality is evaluated.
    """
    from academic.governance import get_academic_governance
    from research.workflow_engine import build_workflow

    gov = get_academic_governance()
    workflow = build_workflow()
    trace_id = str(uuid.uuid4())

    ctx = AgentContext(
        query=query,
        paper_ids=paper_ids or [],
        venue_id=venue_id,
        language=language,
        available_artifacts=dict(extra_artifacts or {}),
    )
    ctx = ctx.with_artifact("query", query)

    pipeline_result = PipelineResult(
        query=query,
        venue_id=venue_id,
        governance_version=gov.version,
        trace_id=trace_id,
    )

    step = workflow.next_step(ctx.produced)
    while step is not None:
        agent_cls = _STEP_AGENT_MAP.get(step.id)
        if agent_cls is None:
            logger.warning(f"No agent mapped for workflow step '{step.id}' — skipping")
            ctx = ctx.with_artifact(step.id, None)
            step = workflow.next_step(ctx.produced)
            continue

        start_t = time.time()
        logger.info(f"Pipeline [{trace_id[:8]}]: running step '{step.id}' with agent '{agent_cls.name}'")

        ctx_step = AgentContext(
            query=ctx.query,
            paper_ids=ctx.paper_ids,
            venue_id=ctx.venue_id,
            workflow_step=step.id,
            available_artifacts=ctx.available_artifacts,
            language=ctx.language,
        )
        agent = agent_cls()
        result = await agent.run(ctx_step)
        duration_ms = (time.time() - start_t) * 1000.0

        pipeline_result.steps.append(result)

        # Log audit trail for observability
        audit_trail_logger.log(
            AuditTrailRecord(
                trace_id=trace_id,
                step_id=step.id,
                agent_name=agent.name,
                rules_applied=getattr(agent, "allowed_tools", []),
                tools_called=list(getattr(agent, "allowed_tools", ())),
                docs_retrieved=ctx.paper_ids,
                status="success" if result.success else "failure",
                duration_ms=duration_ms,
            )
        )

        if result.success:
            if isinstance(result.output, dict):
                for artifact_key in step.produces:
                    val = result.output.get(artifact_key, result.output)
                    ctx = ctx.with_artifact(artifact_key, val)
            else:
                for artifact_key in step.produces:
                    ctx = ctx.with_artifact(artifact_key, result.output)
        else:
            logger.warning(f"Step '{step.id}' failed: {result.errors}")
            for artifact_key in step.produces:
                ctx = ctx.with_artifact(artifact_key, None)

        step = workflow.next_step(ctx.produced)

    # Final Output & Quality Evaluation
    pipeline_result.final_output = next((s.output for s in reversed(pipeline_result.steps) if s.success), None)
    pipeline_result.success = any(s.step in ("synthesize", "export") and s.success for s in pipeline_result.steps)
    pipeline_result.evaluation = evaluate_pipeline_result(pipeline_result)

    logger.info(
        f"Pipeline [{trace_id[:8]}] completed: success={pipeline_result.success}, "
        f"overall_quality={pipeline_result.evaluation.overall_quality}"
    )

    return pipeline_result
