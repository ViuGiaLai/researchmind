"""Evaluation Framework — automated quality benchmarks for accuracy, citation correctness, hallucination, and compliance."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class EvaluationMetrics:
    """Quantitative quality metrics for a pipeline execution."""

    citation_correctness: float  # 0.0 to 1.0
    hallucination_score: float  # 0.0 (no hallucination) to 1.0 (high)
    venue_compliance_score: float  # 0.0 to 1.0 (based on format audit score)
    relevance_score: float  # 0.0 to 1.0
    overall_quality: float  # weighted average

    def to_dict(self) -> dict[str, float]:
        return {
            "citation_correctness": round(self.citation_correctness, 3),
            "hallucination_score": round(self.hallucination_score, 3),
            "venue_compliance_score": round(self.venue_compliance_score, 3),
            "relevance_score": round(self.relevance_score, 3),
            "overall_quality": round(self.overall_quality, 3),
        }


def evaluate_pipeline_result(pipeline_result: Any) -> EvaluationMetrics:
    """Evaluate a PipelineResult object across 4 dimensions and calculate overall quality."""
    steps = getattr(pipeline_result, "steps", [])

    # 1. Citation correctness & Hallucination
    verify_step = next((s for s in steps if s.step == "verify" and s.success), None)
    citation_correctness = 1.0
    hallucination_score = 0.0
    if verify_step and isinstance(verify_step.output, dict):
        total = verify_step.output.get("total", 0)
        invalid_val = verify_step.output.get("invalid", [])
        invalid_count = len(invalid_val) if isinstance(invalid_val, (list, tuple, set)) else int(invalid_val or 0)
        if total > 0:
            citation_correctness = max(0.0, (total - invalid_count) / total)
            hallucination_score = min(1.0, invalid_count / total)

    # 2. Venue compliance score (from audit or export step)
    venue_compliance_score = 0.8  # Default baseline
    for s in reversed(steps):
        if s.success and isinstance(s.output, dict):
            audit_rep = s.output.get("audit_report")
            if isinstance(audit_rep, dict) and "overall_score" in audit_rep:
                venue_compliance_score = float(audit_rep["overall_score"]) / 100.0
                break
            elif "overall_score" in s.output:
                venue_compliance_score = float(s.output["overall_score"]) / 100.0
                break

    # 3. Relevance score
    query = getattr(pipeline_result, "query", "").lower()
    final_output = str(getattr(pipeline_result, "final_output", "")).lower()
    query_terms = [t for t in query.split() if len(t) > 3]
    if query_terms:
        matches = sum(1 for t in query_terms if t in final_output)
        relevance_score = min(1.0, matches / len(query_terms))
    else:
        relevance_score = 1.0

    # Overall weighted quality score
    overall_quality = (
        0.35 * citation_correctness
        + 0.35 * venue_compliance_score
        + 0.20 * relevance_score
        + 0.10 * (1.0 - hallucination_score)
    )

    return EvaluationMetrics(
        citation_correctness=citation_correctness,
        hallucination_score=hallucination_score,
        venue_compliance_score=venue_compliance_score,
        relevance_score=relevance_score,
        overall_quality=overall_quality,
    )
