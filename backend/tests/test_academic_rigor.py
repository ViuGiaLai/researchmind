"""Tests for Rigorous Academic Research System:
1. PRISMA Methodology Protocol (academic/methodology.py)
2. Hypothesis & Falsifiability Engine (academic/hypothesis_engine.py)
3. Threats to Validity Auditor (academic/validity_auditor.py)
4. Open Science & Reproducibility Evaluator (academic/reproducibility.py)
5. Adversarial Refutation Engine (academic/refutation_engine.py)
"""
import pytest

pytestmark = pytest.mark.integration
from academic.methodology import AcademicMethodologyEngine
from academic.hypothesis_engine import AcademicHypothesisEngine
from academic.validity_auditor import ValidityAuditor
from academic.reproducibility import ReproducibilityEvaluator
from academic.refutation_engine import AdversarialRefutationEngine


def test_prisma_methodology_flow():
    engine = AcademicMethodologyEngine()
    candidate_papers = [
        {"title": "Deep Learning for Vision", "year": 2024},
        {"title": "Deep Learning for Vision", "year": 2024},  # duplicate
        {"title": "Transformer Survey Paper", "year": 2025},
        {"title": "Short", "year": 2023},
    ]
    res = engine.evaluate_slr_protocol("transformer vision", candidate_papers)
    assert res["prisma_flow"]["total_identified"] == 4
    assert res["prisma_flow"]["duplicates_removed"] == 1
    assert res["prisma_flow"]["studies_included"] == 2


def test_hypothesis_falsifiability_engine():
    engine = AcademicHypothesisEngine()
    hyp = engine.formalize_hypothesis(
        claim_statement="ResNet-50 outperforms VGG-16 on ImageNet.",
        method_name="ResNet-50",
        baseline_name="VGG-16",
        metric_name="Top-1 Accuracy"
    )
    assert hyp.is_falsifiable is True
    assert "p < 0.05" in hyp.alt_hypothesis_h1
    assert "p >= 0.05" in hyp.null_hypothesis_h0

    eval_res = engine.evaluate_falsifiability_rigor([hyp])
    assert eval_res["falsifiability_score"] == 1.0


def test_validity_auditor_threats():
    auditor = ValidityAuditor()
    text = "We proposed Method A and tested it on ImageNet dataset. Results show accuracy improvement."
    threats = auditor.audit_threats_to_validity(text)
    assert len(threats) >= 2  # missing random seeds, missing statistical significance test, etc.
    
    score = auditor.calculate_validity_score(threats)
    assert score < 1.0


def test_reproducibility_evaluator():
    evaluator = ReproducibilityEvaluator()
    text = "Code is available at https://github.com/example/repo. Data at https://huggingface.co/datasets. We ran on NVIDIA A100 GPU with Adam optimizer learning rate 0.001."
    checklist = evaluator.evaluate_reproducibility(text)
    assert checklist.has_code_url is True
    assert checklist.has_data_url is True
    assert checklist.has_compute_specs is True
    assert checklist.has_hyperparameters is True
    assert checklist.reproducibility_score >= 0.7


def test_adversarial_refutation_engine():
    refuter = AdversarialRefutationEngine()
    counters = refuter.generate_counter_arguments(
        claim_statement="Our Transformer model outperforms SOTA baselines on BLEU benchmark.",
        method_name="Transformer"
    )
    assert len(counters) >= 2
    refutation_types = [c.refutation_angle for c in counters]
    assert "untested_distribution" in refutation_types
    assert "computational_bottleneck" in refutation_types
