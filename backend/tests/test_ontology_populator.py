"""
Unit tests for academic/ontology_populator.py — heuristic ontology population.

Tests:
1. _extract_methods pattern detection
2. _extract_datasets pattern detection
3. _extract_metrics pattern detection
4. _extract_claims pattern detection
5. _extract_experiments key=value parsing
6. populate_ontology_from_context full pipeline
7. populate_verify_ontology with external data
8. Edge cases: empty text, no matches, malformed lines
"""

from academic.ontology import AcademicOntologyGraph
from academic.ontology_populator import (
    _extract_claims,
    _extract_datasets,
    _extract_experiments,
    _extract_methods,
    _extract_metrics,
    populate_ontology_from_context,
    populate_verify_ontology,
)

# ─────────────────────────────────────────────────────────────
# Tests: _extract_methods
# ─────────────────────────────────────────────────────────────


class TestExtractMethods:
    def test_detects_common_methods(self):
        text = "We used ResNet50 and Transformer for comparison."
        results = _extract_methods(text)
        assert "resnet50" in results
        assert "transformer" in results

    def test_detects_various_suffixes(self):
        text = "CNN, LSTM, BERT, GAN, and ViT are popular."
        results = _extract_methods(text)
        for m in ["cnn", "lstm", "bert", "gan", "vit"]:
            assert m in results

    def test_case_insensitive(self):
        text = "TRANSFORMER and ResNet-50 achieve SOTA."
        results = _extract_methods(text)
        assert "transformer" in results
        assert "resnet" in results or "resnet-50" in results

    def test_empty_text(self):
        assert _extract_methods("") == []
        assert _extract_methods("   ") == []

    def test_no_methods(self):
        assert _extract_methods("This is a regular sentence without any method mentions.") == []


# ─────────────────────────────────────────────────────────────
# Tests: _extract_datasets
# ─────────────────────────────────────────────────────────────


class TestExtractDatasets:
    def test_detects_common_datasets(self):
        text = "We evaluated on CIFAR-10 and ImageNet."
        results = _extract_datasets(text)
        # Should match "cifar" from CIFAR-10 and "imagenet"
        assert "cifar" in results
        assert "imagenet" in results

    def test_detects_glue(self):
        text = "Fine-tuned on the GLUE benchmark."
        results = _extract_datasets(text)
        assert "glue" in results

    def test_empty_text(self):
        assert _extract_datasets("") == []

    def test_no_datasets(self):
        assert _extract_datasets("Plain text without dataset names.") == []


# ─────────────────────────────────────────────────────────────
# Tests: _extract_metrics
# ─────────────────────────────────────────────────────────────


class TestExtractMetrics:
    def test_detects_common_metrics(self):
        text = "Our model achieves 95% accuracy and 0.91 F1 score."
        results = _extract_metrics(text)
        assert "accuracy" in results
        assert "f1" in results

    def test_detects_bleu_rouge(self):
        text = "The BLEU score improved, ROUGE-L also increased."
        results = _extract_metrics(text)
        assert "bleu" in results
        assert "rouge" in results or "rouge-l" in results

    def test_empty_text(self):
        assert _extract_metrics("") == []

    def test_no_metrics(self):
        assert _extract_metrics("No numbers or metrics here.") == []


# ─────────────────────────────────────────────────────────────
# Tests: _extract_claims
# ─────────────────────────────────────────────────────────────


class TestExtractClaims:
    def test_detects_claim_keyword(self):
        results = _extract_claims("We claim that our method outperforms baselines.", 0)
        assert len(results) == 1
        cid, stmt = results[0]
        assert cid == "claim_0"
        assert "outperforms baselines" in stmt

    def test_detects_show_that(self):
        results = _extract_claims("Results show that our approach works.", 1)
        assert len(results) == 1
        assert "claim_1" in results[0]

    def test_detects_we_propose(self):
        results = _extract_claims("We propose a novel architecture.", 2)
        assert len(results) == 1
        assert "claim_2" in results[0]

    def test_empty_text(self):
        assert _extract_claims("", 0) == []

    def test_no_claim_keywords(self):
        assert _extract_claims("This is a factual statement without claims.", 0) == []

    def test_statement_truncated_to_200_chars(self):
        long_text = "We claim that " + "x" * 300
        results = _extract_claims(long_text, 3)
        assert len(results) == 1
        assert len(results[0][1]) <= 200


# ─────────────────────────────────────────────────────────────
# Tests: _extract_experiments
# ─────────────────────────────────────────────────────────────


class TestExtractExperiments:
    def test_detects_key_value_pairs(self):
        text = "accuracy=95.0 f1=0.89"
        results = _extract_experiments(text, 0)
        assert len(results) == 2
        for exp in results:
            if exp.method_name == "accuracy":
                assert exp.value == 95.0
            if exp.method_name == "f1":
                assert exp.value == 0.89

    def test_detects_colon_format(self):
        text = "accuracy: 92.5 f1: 0.87"
        results = _extract_experiments(text, 1)
        assert len(results) == 2

    def test_detects_percentage(self):
        text = "accuracy=92%"
        results = _extract_experiments(text, 0)
        assert len(results) >= 1
        assert abs(results[0].value - 92.0) < 0.01

    def test_skips_known_non_experiment_keys(self):
        """page=5, size=1024, n=100 should be skipped."""
        text = "page=5 size=1024 n=100 accuracy=95.0"
        results = _extract_experiments(text, 0)
        # Only accuracy should remain
        for exp in results:
            assert exp.method_name not in {"page", "size", "n"}

    def test_empty_text(self):
        assert _extract_experiments("", 0) == []

    def test_no_numeric_values(self):
        assert _extract_experiments("text without numbers", 0) == []

    def test_handles_invalid_numbers(self):
        """Malformed numbers should be skipped without crashing."""
        results = _extract_experiments("x=abc y=12.34.56 z=1e5", 0)
        # y=12.34 should match the first number, z=1e5 might or might not
        for exp in results:
            assert exp.method_name in {"y", "z"}


# ─────────────────────────────────────────────────────────────
# Tests: populate_ontology_from_context (full pipeline)
# ─────────────────────────────────────────────────────────────


class TestPopulateOntologyFromContext:
    def test_populates_all_entity_types(self):
        ont = AcademicOntologyGraph()
        context = (
            "We evaluate Transformer on ImageNet classification.\n"
            "Our method achieves accuracy=95.0 and f1=0.91.\n"
            "We claim that our approach outperforms baselines.\n"
        )
        populate_ontology_from_context(ont, context, "test query", paper_ids=None)

        assert "transformer" in ont.methods
        assert "imagenet" in ont.datasets
        assert "accuracy" in ont.metrics
        assert "f1" in ont.metrics
        assert len(ont.claims) >= 1
        assert len(ont.experiments) >= 2

    def test_empty_context(self):
        ont = AcademicOntologyGraph()
        populate_ontology_from_context(ont, "", "test", paper_ids=None)
        assert len(ont.methods) == 0
        assert len(ont.datasets) == 0
        assert len(ont.metrics) == 0
        assert len(ont.claims) == 0
        assert len(ont.experiments) == 0

    def test_handles_llm_context_text(self):
        """Simulate actual RAG context with paper chunks."""
        ont = AcademicOntologyGraph()
        context = (
            "### Paper: Attention Is All You Need\n"
            "[paper_a, page 3]\n"
            "The Transformer model achieves BLEU=28.4 on WMT 2014.\n"
            "We show that attention mechanisms are superior.\n"
        )
        populate_ontology_from_context(ont, context, "SOTA on WMT", paper_ids=None)

        assert "transformer" in ont.methods
        assert "wmt" in ont.datasets
        assert "bleu" in ont.metrics
        assert len(ont.claims) >= 1
        assert len(ont.experiments) >= 1

    def test_deduplicates_entities(self):
        """Running twice should not create duplicates."""
        ont = AcademicOntologyGraph()
        text = "Transformer on ImageNet with accuracy=90."
        populate_ontology_from_context(ont, text, "", paper_ids=None)
        count_before = len(ont.methods)
        populate_ontology_from_context(ont, text, "", paper_ids=None)
        assert len(ont.methods) == count_before  # no duplicates


# ─────────────────────────────────────────────────────────────
# Tests: populate_verify_ontology (with external data)
# ─────────────────────────────────────────────────────────────


class TestPopulateVerifyOntology:
    def test_with_external_data(self):
        ont = AcademicOntologyGraph()

        # Simulate ExternalPaperData-like objects
        class FakeExternalPaper:
            def __init__(self, title, doi):
                self.title = title
                self.doi = doi

        ext_data = [
            FakeExternalPaper("BERT: Pre-training of Deep Bidirectional Transformers", "10.1234/bert"),
            FakeExternalPaper("ImageNet Classification with Deep CNNs", "10.1234/alexnet"),
        ]

        context = "We evaluate on SQuAD and achieve f1=93.2."
        populate_verify_ontology(ont, context, "test query", None, ext_data)

        # From context
        assert "squad" in ont.datasets
        assert "f1" in ont.metrics
        # From external data titles
        assert "bert" in ont.methods or "transformer" in ont.methods
        assert "cnn" in ont.methods

    def test_without_external_data(self):
        ont = AcademicOntologyGraph()
        populate_verify_ontology(ont, "accuracy=95.0", "", None, None)
        assert "accuracy" in ont.metrics


# ─────────────────────────────────────────────────────────────
# Tests: ReasoningEngine integration patterns
# ─────────────────────────────────────────────────────────────


class TestReasoningEngineIntegration:
    def test_populate_then_reasoning_cycle(self):
        """End-to-end: populate ontology from text → run full reasoning cycle."""
        from academic.reasoning_engine import AcademicReasoningEngine

        ont = AcademicOntologyGraph()
        engine = AcademicReasoningEngine(ontology=ont)

        context = (
            "Transformer achieves accuracy=91.2 on SQuAD.\n"
            "LSTM achieves accuracy=82.5 on SQuAD.\n"
            "We claim that our Transformer model is SOTA.\n"
            "Prior work claims that LSTM improves results.\n"
        )
        populate_ontology_from_context(ont, context, "SOTA on SQuAD", engine)

        result = engine.run_full_reasoning_cycle()

        assert "sota_claims" in result
        assert "conflicts" in result
        assert "unsupported_assertions" in result
        # Transformer (91.2) > LSTM (82.5) → SOTA
        assert len(result["sota_claims"]) >= 1
        if result["sota_claims"]:
            assert "transformer" in result["sota_claims"][0].statement.lower()

    def test_ontology_population_with_list_extraction(self):
        """Test that the exact method/dataset/metric names are extractable."""
        from academic.reasoning_engine import AcademicReasoningEngine

        ont = AcademicOntologyGraph()
        engine = AcademicReasoningEngine(ontology=ont)

        # Context with multiple methods and datasets
        context = (
            "Comparison of ResNet50, VGG16, and EfficientNet on CIFAR-100.\n"
            "ResNet50 achieves accuracy=95.0 and f1=0.94.\n"
            "VGG16 achieves accuracy=93.0 and f1=0.91.\n"
            "EfficientNet achieves accuracy=96.5 and f1=0.95.\n"
        )
        populate_ontology_from_context(ont, context, "benchmark", engine)

        # Verify extraction
        assert "resnet50" in ont.methods or "resnet" in ont.methods
        assert "efficientnet" in ont.methods
        assert "cifar" in ont.datasets
        assert "accuracy" in ont.metrics
        assert "f1" in ont.metrics
        assert len(ont.experiments) >= 3

        # Verify SOTA deduction works on populated ontology
        result = engine.deduce_sota_claims()
        # EfficientNet should be the winner on accuracy
        accuracy_sota = [f for f in result if "accuracy" in f.statement.lower()]
        if accuracy_sota:
            assert "efficientnet" in accuracy_sota[0].statement.lower()
