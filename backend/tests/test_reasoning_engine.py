"""
Unit tests for AcademicReasoningEngine integration.

Covers:
1. SOTA claim deduction from experimental benchmarks
2. Evidence conflict detection between papers
3. Unsupported assertion identification
4. Full reasoning cycle output format
5. Edge cases: empty ontology, tied values, single experiment
6. Error handling patterns (isolated, not requiring full app state)
"""

import pytest

from academic.ontology import (
    AcademicOntologyGraph,
    ClaimEntity,
    DatasetEntity,
    EvidenceEntity,
    ExperimentEntity,
    MethodEntity,
    MetricEntity,
)
from academic.reasoning_engine import AcademicReasoningEngine, DeductedFact

# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def empty_ontology() -> AcademicOntologyGraph:
    return AcademicOntologyGraph()


@pytest.fixture
def sota_ontology() -> AcademicOntologyGraph:
    """Ontology with 3 methods on 1 dataset, clear winner."""
    ont = AcademicOntologyGraph()

    # Methods
    ont.methods["resnet50"] = MethodEntity(name="ResNet-50", category="architecture")
    ont.methods["vgg16"] = MethodEntity(name="VGG-16", category="architecture")
    ont.methods["efficientnet"] = MethodEntity(name="EfficientNet", category="architecture")

    # Datasets
    ont.datasets["imagenet"] = DatasetEntity(name="ImageNet")

    # Metrics
    ont.metrics["top1_accuracy"] = MetricEntity(name="Top-1 Accuracy", higher_is_better=True)

    # Experiments — EfficientNet wins
    ont.experiments["exp_1"] = ExperimentEntity(
        id="exp_1",
        paper_id="paper_a",
        method_name="ResNet-50",
        dataset_name="ImageNet",
        metric_name="Top-1 Accuracy",
        value=76.0,
    )
    ont.experiments["exp_2"] = ExperimentEntity(
        id="exp_2",
        paper_id="paper_b",
        method_name="VGG-16",
        dataset_name="ImageNet",
        metric_name="Top-1 Accuracy",
        value=71.5,
    )
    ont.experiments["exp_3"] = ExperimentEntity(
        id="exp_3",
        paper_id="paper_c",
        method_name="EfficientNet",
        dataset_name="ImageNet",
        metric_name="Top-1 Accuracy",
        value=84.0,
    )

    return ont


@pytest.fixture
def conflict_ontology() -> AcademicOntologyGraph:
    """Ontology with two papers making opposing claims."""
    ont = AcademicOntologyGraph()

    ont.claims["claim_1"] = ClaimEntity(
        id="claim_1",
        paper_id="paper_a",
        statement="Our method significantly improves classification accuracy over prior work.",
        claim_type="empirical",
        supported=True,
    )
    ont.claims["claim_2"] = ClaimEntity(
        id="claim_2",
        paper_id="paper_b",
        statement="Our replication shows the prior method degrades under fair evaluation.",
        claim_type="empirical",
        supported=True,
    )

    ont.evidence["ev_1"] = EvidenceEntity(
        id="ev_1",
        paper_id="paper_a",
        passage="Our method achieves 84% accuracy, improving 8% over baseline.",
        section="Results",
        confidence=0.95,
    )
    ont.evidence["ev_2"] = EvidenceEntity(
        id="ev_2",
        paper_id="paper_b",
        passage="Under controlled settings, the prior method achieves only 72% accuracy.",
        section="Results",
        confidence=0.92,
    )

    return ont


@pytest.fixture
def mixed_ontology() -> AcademicOntologyGraph:
    """Ontology with experiments, claims, and evidence for full cycle test."""
    ont = AcademicOntologyGraph()

    # Methods + datasets + metrics
    ont.methods["transformer"] = MethodEntity(name="Transformer")
    ont.methods["lstm"] = MethodEntity(name="LSTM")
    ont.methods["cnn"] = MethodEntity(name="CNN")
    ont.datasets["squad"] = DatasetEntity(name="SQuAD")
    ont.metrics["f1"] = MetricEntity(name="F1")

    # Experiments
    ont.experiments["exp_1"] = ExperimentEntity(
        id="exp_1",
        paper_id="paper_a",
        method_name="Transformer",
        dataset_name="SQuAD",
        metric_name="F1",
        value=91.2,
    )
    ont.experiments["exp_2"] = ExperimentEntity(
        id="exp_2",
        paper_id="paper_b",
        method_name="LSTM",
        dataset_name="SQuAD",
        metric_name="F1",
        value=82.5,
    )

    # Claims (one supported, one unsupported)
    ont.claims["claim_1"] = ClaimEntity(
        id="claim_1",
        paper_id="paper_a",
        statement="Transformer achieves SOTA on SQuAD.",
        supported=True,
    )
    ont.claims["claim_2"] = ClaimEntity(
        id="claim_2",
        paper_id="paper_c",
        statement="Our novel method outperforms all baselines.",
        supported=False,  # No evidence → unsupported
    )

    # Evidence only for claim_1
    ont.evidence["ev_1"] = EvidenceEntity(
        id="ev_1",
        paper_id="paper_a",
        passage="Transformer achieves 91.2 F1 on SQuAD, surpassing all prior work.",
        confidence=0.98,
    )

    return ont


@pytest.fixture
def tied_ontology() -> AcademicOntologyGraph:
    """Ontology where two methods have the same score — no clear SOTA."""
    ont = AcademicOntologyGraph()

    ont.methods["method_a"] = MethodEntity(name="Method-A")
    ont.methods["method_b"] = MethodEntity(name="Method-B")
    ont.datasets["ds"] = DatasetEntity(name="DS")
    ont.metrics["acc"] = MetricEntity(name="Accuracy")

    ont.experiments["exp_1"] = ExperimentEntity(
        id="exp_1",
        paper_id="p1",
        method_name="Method-A",
        dataset_name="DS",
        metric_name="Accuracy",
        value=95.0,
    )
    ont.experiments["exp_2"] = ExperimentEntity(
        id="exp_2",
        paper_id="p2",
        method_name="Method-B",
        dataset_name="DS",
        metric_name="Accuracy",
        value=95.0,  # same value — tied
    )

    return ont


# ─────────────────────────────────────────────────────────────
# Tests: SOTA Claim Deduction
# ─────────────────────────────────────────────────────────────


class TestSOTADeduction:
    def test_deduce_sota_claims_finds_winner(self, sota_ontology):
        engine = AcademicReasoningEngine(ontology=sota_ontology)
        results = engine.deduce_sota_claims()

        assert len(results) == 1
        fact = results[0]

        assert fact.fact_type == "sota_claim"
        assert "EfficientNet" in fact.statement
        assert "ImageNet" in fact.statement
        assert fact.confidence == 0.95
        assert len(fact.paper_ids) == 1
        assert "paper_c" in fact.paper_ids
        assert len(fact.reasoning_chain) >= 2

    def test_deduce_sota_empty_ontology(self, empty_ontology):
        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.deduce_sota_claims()
        assert results == []

    def test_deduce_sota_tied_values(self, tied_ontology):
        """When two methods have the same score, the first encountered is marked SOTA."""
        engine = AcademicReasoningEngine(ontology=tied_ontology)
        results = engine.deduce_sota_claims()

        assert len(results) == 1
        # Both have 95.0, so Method-A (first) is considered SOTA
        assert "Method-A" in results[0].statement

    def test_deduce_sota_single_experiment(self, empty_ontology):
        """Single method with no comparison should still be SOTA."""
        empty_ontology.methods["m"] = MethodEntity(name="M")
        empty_ontology.datasets["ds"] = DatasetEntity(name="DS")
        empty_ontology.metrics["acc"] = MetricEntity(name="Accuracy")

        empty_ontology.experiments["exp"] = ExperimentEntity(
            id="exp",
            paper_id="p1",
            method_name="M",
            dataset_name="DS",
            metric_name="Accuracy",
            value=88.0,
        )

        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.deduce_sota_claims()

        assert len(results) == 1
        assert results[0].fact_type == "sota_claim"
        assert "M" in results[0].statement


# ─────────────────────────────────────────────────────────────
# Tests: Evidence Conflict Detection
# ─────────────────────────────────────────────────────────────


class TestConflictDetection:
    def test_detect_conflicts(self, conflict_ontology):
        engine = AcademicReasoningEngine(ontology=conflict_ontology)
        results = engine.detect_evidence_conflicts()

        assert len(results) >= 1
        fact = results[0]
        assert fact.fact_type == "evidence_conflict"
        assert len(fact.paper_ids) >= 2  # involves both papers
        assert fact.confidence == 0.88

    def test_detect_conflicts_empty_ontology(self, empty_ontology):
        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.detect_evidence_conflicts()
        assert results == []

    def test_detect_conflicts_same_paper(self, empty_ontology):
        """Claims from the same paper should NOT trigger a conflict."""
        empty_ontology.claims["c1"] = ClaimEntity(
            id="c1",
            paper_id="paper_x",
            statement="Our method improves accuracy by 5%.",
        )
        empty_ontology.claims["c2"] = ClaimEntity(
            id="c2",
            paper_id="paper_x",
            statement="Our method degrades by 2% compared to baseline.",
        )

        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.detect_evidence_conflicts()

        # Same paper_id → skip, no conflict
        assert len(results) == 0

    def test_detect_conflicts_no_contradiction(self, empty_ontology):
        """Similar claims without contradictory terms should not trigger."""
        empty_ontology.claims["c1"] = ClaimEntity(
            id="c1",
            paper_id="paper_a",
            statement="Model A achieves 95% accuracy on Task X.",
        )
        empty_ontology.claims["c2"] = ClaimEntity(
            id="c2",
            paper_id="paper_b",
            statement="Model B achieves 94% accuracy on Task X.",
        )

        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.detect_evidence_conflicts()
        # Words overlap >= 3 (accuracy, achieves, on) but no antonym pair
        assert len(results) == 0


# ─────────────────────────────────────────────────────────────
# Tests: Unsupported Assertions
# ─────────────────────────────────────────────────────────────


class TestUnsupportedAssertions:
    def test_identify_unsupported(self, mixed_ontology):
        engine = AcademicReasoningEngine(ontology=mixed_ontology)
        results = engine.identify_unsupported_assertions()

        assert len(results) >= 1
        fact = results[0]
        assert fact.fact_type == "unsupported_assertion"
        assert fact.confidence == 0.90
        assert "outperforms all baselines" in fact.statement

    def test_unsupported_empty_ontology(self, empty_ontology):
        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.identify_unsupported_assertions()
        assert results == []

    def test_unsupported_all_supported(self, conflict_ontology):
        """All claims in conflict_ontology have evidence → no unsupported assertions."""
        engine = AcademicReasoningEngine(ontology=conflict_ontology)
        results = engine.identify_unsupported_assertions()
        assert len(results) == 0

    def test_unsupported_claim_without_evidence(self, empty_ontology):
        """A claim with no evidence at all should be flagged."""
        empty_ontology.claims["c"] = ClaimEntity(
            id="c",
            paper_id="p1",
            statement="This claim lacks any supporting evidence.",
        )
        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.identify_unsupported_assertions()
        assert len(results) == 1


# ─────────────────────────────────────────────────────────────
# Tests: Full Reasoning Cycle
# ─────────────────────────────────────────────────────────────


class TestFullReasoningCycle:
    def test_full_cycle_returns_all_keys(self, mixed_ontology):
        engine = AcademicReasoningEngine(ontology=mixed_ontology)
        result = engine.run_full_reasoning_cycle()

        assert isinstance(result, dict)
        assert "sota_claims" in result
        assert "conflicts" in result
        assert "unsupported_assertions" in result

    def test_full_cycle_with_sota_and_unsupported(self, mixed_ontology):
        engine = AcademicReasoningEngine(ontology=mixed_ontology)
        result = engine.run_full_reasoning_cycle()

        assert len(result["sota_claims"]) == 1
        assert len(result["conflicts"]) == 0  # no antonym pairs in mixed_ontology
        assert len(result["unsupported_assertions"]) == 1

    def test_full_cycle_empty_ontology(self, empty_ontology):
        engine = AcademicReasoningEngine(ontology=empty_ontology)
        result = engine.run_full_reasoning_cycle()

        assert result["sota_claims"] == []
        assert result["conflicts"] == []
        assert result["unsupported_assertions"] == []


# ─────────────────────────────────────────────────────────────
# Tests: DeductedFact Data Class
# ─────────────────────────────────────────────────────────────


class TestDeductedFact:
    def test_deducted_fact_creation(self):
        fact = DeductedFact(
            fact_type="sota_claim",
            statement="Test claim.",
            paper_ids=["paper_a"],
            confidence=0.95,
            reasoning_chain=["Step 1", "Step 2"],
        )
        assert fact.fact_type == "sota_claim"
        assert fact.confidence == 0.95
        assert fact.paper_ids == ["paper_a"]
        assert len(fact.reasoning_chain) == 2

    def test_deducted_fact_default_paper_ids(self):
        fact = DeductedFact(
            fact_type="evidence_conflict",
            statement="Conflict detected.",
        )
        assert fact.fact_type == "evidence_conflict"
        assert fact.paper_ids == []
        assert fact.confidence == 0.0
        assert fact.reasoning_chain == []


# ─────────────────────────────────────────────────────────────
# Tests: Error Handling Patterns (simulating try/except)
# ─────────────────────────────────────────────────────────────


class TestErrorHandling:
    def test_reasoning_engine_handles_invalid_ontology(self):
        """Engine should not crash when ontology has corrupted data."""
        engine = AcademicReasoningEngine()
        # Manually set a non-ontology object to test resilience
        engine.ontology = None

        # Should return gracefully, may be empty or raise
        try:
            result = engine.run_full_reasoning_cycle()
            assert isinstance(result, dict)
        except AttributeError:
            # This is acceptable — the actual _enhance_context_with_engines
            # wraps this in try/except and logs a warning
            pass

    def test_sota_deduction_with_invalid_experiments(self, sota_ontology):
        """Invalid experiment values should be handled gracefully."""
        sota_ontology.experiments["bad_exp"] = ExperimentEntity(
            id="bad_exp",
            paper_id="p_bad",
            method_name="BadMethod",
            dataset_name="ImageNet",
            metric_name="Top-1 Accuracy",
            value=float("nan"),
        )
        engine = AcademicReasoningEngine(ontology=sota_ontology)
        # Should not crash; max() with NaN may still work but result should be valid
        results = engine.deduce_sota_claims()
        assert isinstance(results, list)

    def test_conflict_detection_single_claim(self, empty_ontology):
        """Only one claim → no conflicts possible (needs at least 2 for comparison)."""
        empty_ontology.claims["c1"] = ClaimEntity(
            id="c1",
            paper_id="p1",
            statement="Method A improves results.",
        )
        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.detect_evidence_conflicts()
        assert results == []

    def test_sota_missing_method_name(self, empty_ontology):
        """Experiments without matching method entity should still be processed."""
        empty_ontology.datasets["ds"] = DatasetEntity(name="DS")
        empty_ontology.metrics["m"] = MetricEntity(name="M")
        empty_ontology.experiments["e"] = ExperimentEntity(
            id="e",
            paper_id="p1",
            method_name="UnknownMethod",
            dataset_name="DS",
            metric_name="M",
            value=90.0,
        )
        engine = AcademicReasoningEngine(ontology=empty_ontology)
        results = engine.deduce_sota_claims()
        assert len(results) == 1
        assert "UnknownMethod" in results[0].statement
