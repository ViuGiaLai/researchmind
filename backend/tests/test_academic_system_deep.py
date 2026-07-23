"""Deep Academic AI System Tests:
1. Academic Ontology (academic/ontology.py)
2. Reasoning Engine (academic/reasoning_engine.py)
3. Academic Verification Engine (academic/verification_engine.py)
4. Scientific Writing Engine (academic/writing_engine.py)
5. Evidence Engine (academic/evidence_engine.py)
6. Academic Evaluation Suite (evaluation/academic_evaluator.py)
"""

import pytest

from academic.evidence_engine import EvidenceEngine
from academic.ontology import (
    AcademicOntologyGraph,
    ClaimEntity,
    EvidenceEntity,
    ExperimentEntity,
    LimitationEntity,
    PaperEntity,
)
from academic.reasoning_engine import AcademicReasoningEngine
from academic.verification_engine import AcademicVerificationEngine
from academic.writing_engine import ScientificWritingEngine
from evaluation.academic_evaluator import evaluate_academic_benchmark

pytestmark = pytest.mark.integration


def test_academic_ontology_10_entities():
    graph = AcademicOntologyGraph()
    graph.add_paper(PaperEntity(id="p1", title="Transformer Paper", doi="10.5555/123"))
    graph.add_experiment(
        ExperimentEntity(
            id="e1",
            paper_id="p1",
            method_name="Transformer",
            dataset_name="ImageNet",
            metric_name="Accuracy",
            value=92.5,
        )
    )
    graph.add_claim(ClaimEntity(id="c1", paper_id="p1", statement="Transformer improves accuracy."))
    graph.add_evidence(EvidenceEntity(id="ev1", paper_id="p1", passage="Results show 92.5% accuracy."))
    graph.add_limitation(LimitationEntity(id="l1", paper_id="p1", description="Requires large compute."))

    stats = graph.get_summary_stats()
    assert stats["papers"] == 1
    assert stats["experiments"] == 1
    assert stats["claims"] == 1
    assert stats["evidence"] == 1
    assert stats["limitations"] == 1


def test_academic_reasoning_engine():
    graph = AcademicOntologyGraph()
    graph.add_experiment(
        ExperimentEntity(
            id="e1", paper_id="p1", method_name="ResNet", dataset_name="COCO", metric_name="mAP", value=45.0
        )
    )
    graph.add_experiment(
        ExperimentEntity(
            id="e2", paper_id="p2", method_name="YOLOv8", dataset_name="COCO", metric_name="mAP", value=52.0
        )
    )
    graph.add_claim(ClaimEntity(id="c1", paper_id="p1", statement="Method improves performance", supported=False))

    reasoner = AcademicReasoningEngine(graph)
    sota_facts = reasoner.deduce_sota_claims()
    assert len(sota_facts) >= 1
    assert "YOLOv8" in sota_facts[0].statement

    unsupported = reasoner.identify_unsupported_assertions()
    assert len(unsupported) == 1
    assert unsupported[0].paper_ids == ["p1"]


def test_academic_verification_engine():
    verifier = AcademicVerificationEngine()
    res = verifier.verify_manuscript(
        title="Deep Learning Survey",
        text_content="## Abstract\nShort abstract text.\n\n## Introduction\nIntro text.\n\n## Method\nMethod text.\n\n## Results\nResults text.\n\n## Conclusion\nConclusion.\n\n## References\n[1] Vaswani et al. 2017. https://doi.org/10.5555/3295222.3295349",
        venue_id="ieee_trans",
        citations=["[1] Vaswani et al. 2017. https://doi.org/10.5555/3295222.3295349"],
    )
    assert res.citation_correctness is True
    assert res.venue_compliant is True
    assert res.reference_exists is True


def test_scientific_writing_engine():
    writer = ScientificWritingEngine()
    tmpl = writer.get_section_template("Abstract")
    assert tmpl.section_name == "Abstract"
    assert len(tmpl.writing_rules) > 0

    formatted = writer.format_section("Method", "Our method uses self-attention.")
    assert "## Method" in formatted
    assert "self-attention" in formatted


def test_evidence_engine():
    engine = EvidenceEngine()
    grounded = engine.ground_claims(
        text_content="- Transformer architecture improves machine translation performance.",
        evidence_context="Retrieved document: Transformer architecture improves machine translation performance on BLEU benchmark.",
    )
    assert len(grounded) >= 1
    assert grounded[0].confidence_score >= 0.7
    assert grounded[0].is_directly_supported is True


def test_academic_evaluation_suite():
    metrics = evaluate_academic_benchmark(
        text_content="## Abstract\nShort abstract.\n\n## Method\nMethod text.",
        evidence_context="Evidence passage",
        verification_details={
            "citation_check": {"total": 2, "verified": [{"doi": "10.123"}], "invalid": []},
            "venue_audit": {"overall_score": 90},
        },
    )
    assert metrics.citation_accuracy == 0.5
    assert metrics.hallucination_rate == 0.0
    assert metrics.writing_quality >= 0.7
    assert metrics.overall_academic_score > 0.7
