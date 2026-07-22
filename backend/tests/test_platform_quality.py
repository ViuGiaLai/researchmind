"""Quality Evolution Tests for Academic AI Platform:
- Evaluation Framework (evaluation/platform_evaluator.py)
- Memory & Learning (academic/memory.py)
- Observability (common/audit_trail.py)
- Plugin Manager (academic/plugins.py)
- Multi-Agent ReviewAgent (agents/review_agent.py)
- Continuous Guideline Sync (publishing/guideline_fetcher.py)
"""
import pytest
from evaluation.platform_evaluator import evaluate_pipeline_result, EvaluationMetrics
from academic.memory import MemoryStore, FeedbackEntry
from common.audit_trail import AuditTrailLogger, AuditTrailRecord
from academic.plugins import plugin_manager
from agents.review_agent import ReviewAgent
from agents import run_pipeline, AgentContext
from publishing.guideline_fetcher import check_all_venue_updates


def test_evaluation_framework():
    class DummyStep:
        def __init__(self, step, success, output):
            self.step = step
            self.success = success
            self.output = output

    class DummyResult:
        query = "transformer architectures"
        final_output = "This paper analyzes transformer architectures."
        steps = [
            DummyStep("verify", True, {"total": 5, "invalid": 0}),
            DummyStep("audit", True, {"audit_report": {"overall_score": 95}}),
        ]

    eval_metrics = evaluate_pipeline_result(DummyResult())
    assert isinstance(eval_metrics, EvaluationMetrics)
    assert eval_metrics.citation_correctness == 1.0
    assert eval_metrics.overall_quality > 0.8
    assert "overall_quality" in eval_metrics.to_dict()


def test_memory_store(tmp_path):
    mem_file = tmp_path / "test_memory.json"
    mem = MemoryStore(storage_path=mem_file)
    entry = FeedbackEntry(
        user_id="user123",
        paper_id="paper001",
        venue_id="ieee_trans",
        step_id="audit",
        issue_type="section_missing",
        user_correction="Added missing Method section header",
        agent_output="Missing method section",
    )
    mem.record_feedback(entry)
    feedback_list = mem.get_feedback_for_venue("ieee_trans")
    assert len(feedback_list) == 1
    assert feedback_list[0]["user_id"] == "user123"


def test_observability_audit_trail(tmp_path):
    audit_file = tmp_path / "audit_trail.jsonl"
    logger_instance = AuditTrailLogger(log_path=audit_file)
    record = AuditTrailRecord(
        trace_id="trace_001",
        step_id="audit",
        agent_name="audit_agent",
        rules_applied=["format_compliance"],
        tools_called=["format_auditor"],
        docs_retrieved=["doc1"],
        status="success",
        duration_ms=12.5,
    )
    logger_instance.log(record)
    assert audit_file.exists()
    lines = audit_file.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert "trace_001" in lines[0]


def test_plugin_manager():
    venue_id = plugin_manager.register_venue({
        "id": "custom_conf",
        "name": "Custom Conference 2026",
        "venue_code": "CUSTOM",
        "publisher": "Custom Press",
        "version": "1.0",
    })
    assert venue_id == "custom_conf"
    assert plugin_manager.get_custom_venue("custom_conf")["name"] == "Custom Conference 2026"


@pytest.mark.asyncio
async def test_review_agent():
    agent = ReviewAgent()
    assert agent.name == "review_agent"
    ctx = AgentContext(
        query="What are transformer models?",
        venue_id="ieee_trans",
        workflow_step="review",
        available_artifacts={"title": "Test Paper", "draft": "## Abstract\nShort abstract.\n\n## Method\nProposed method."},
    )
    result = await agent.run(ctx)
    assert result.success is True
    assert "overall_recommendation" in result.output


def test_continuous_guideline_sync():
    sync_report = check_all_venue_updates()
    assert sync_report["total_venues"] >= 12
    assert "results" in sync_report


@pytest.mark.asyncio
async def test_orchestrator_pipeline_with_evaluation_and_observability():
    res = await run_pipeline("What are transformer models?", venue_id="ieee_trans")
    assert res.success is True
    assert res.trace_id != ""
    assert res.evaluation is not None
    assert res.evaluation.overall_quality > 0.0
