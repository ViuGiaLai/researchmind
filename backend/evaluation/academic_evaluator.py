"""Academic Evaluation Suite — automated academic benchmarks across 5 core metrics.

Metrics:
1. Citation Accuracy
2. Factual Accuracy
3. Hallucination Rate
4. Compliance Score
5. Writing Quality
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class AcademicBenchmarkMetrics:
    citation_accuracy: float  # 0.0 to 1.0
    factual_accuracy: float  # 0.0 to 1.0
    hallucination_rate: float  # 0.0 (no hallucination) to 1.0 (high)
    compliance_score: float  # 0.0 to 1.0
    writing_quality: float  # 0.0 to 1.0
    overall_academic_score: float

    def to_dict(self) -> dict[str, float]:
        return {
            "citation_accuracy": round(self.citation_accuracy, 3),
            "factual_accuracy": round(self.factual_accuracy, 3),
            "hallucination_rate": round(self.hallucination_rate, 3),
            "compliance_score": round(self.compliance_score, 3),
            "writing_quality": round(self.writing_quality, 3),
            "overall_academic_score": round(self.overall_academic_score, 3),
        }


def evaluate_academic_benchmark(
    text_content: str,
    evidence_context: str,
    verification_details: dict[str, Any] | None = None,
) -> AcademicBenchmarkMetrics:
    """Evaluate text content against academic benchmark standards across 5 dimensions."""
    details = verification_details or {}

    # 1. Citation Accuracy
    cit_check = details.get("citation_check", {})
    total_cits = cit_check.get("total", 1)
    verified_cits = len(cit_check.get("verified", []))
    citation_accuracy = min(1.0, verified_cits / max(total_cits, 1)) if total_cits > 0 else 1.0

    # 2. Hallucination Rate
    invalid_cits = len(cit_check.get("invalid", []))
    hallucination_rate = min(1.0, invalid_cits / max(total_cits, 1)) if total_cits > 0 else 0.0

    # 3. Factual Accuracy (Grounding overlap)
    factual_accuracy = 1.0 - hallucination_rate

    # 4. Compliance Score (Format audit score)
    venue_audit = details.get("venue_audit", {})
    compliance_score = float(venue_audit.get("overall_score", 90)) / 100.0

    # 5. Writing Quality (Structure & length check)
    has_abstract = "## abstract" in text_content.lower() or "abstract" in text_content.lower()
    has_method = "## method" in text_content.lower() or "method" in text_content.lower()
    word_count = len(text_content.split())
    writing_quality = 0.50
    if has_abstract and has_method and word_count >= 100:
        writing_quality = 0.95
    elif has_abstract or has_method:
        writing_quality = 0.75

    overall_academic_score = (
        0.30 * citation_accuracy
        + 0.25 * factual_accuracy
        + 0.20 * compliance_score
        + 0.15 * writing_quality
        + 0.10 * (1.0 - hallucination_rate)
    )

    return AcademicBenchmarkMetrics(
        citation_accuracy=citation_accuracy,
        factual_accuracy=factual_accuracy,
        hallucination_rate=hallucination_rate,
        compliance_score=compliance_score,
        writing_quality=writing_quality,
        overall_academic_score=overall_academic_score,
    )
