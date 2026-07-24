"""
Ontology Populator — heuristic extraction of academic entities from RAG context.

Populates an AcademicOntologyGraph by scanning text for:
- Methods (Net, Transformer, GAN, BERT, CNN, RNN, LSTM suffixes)
- Datasets (CIFAR, ImageNet, MNIST, SQuAD, GLUE, etc.)
- Metrics (Accuracy, F1, BLEU, Perplexity, Precision, Recall, etc.)
- Claims (sentences containing "claim", "argue", "show that", etc.)
- Experiments (key=value pairs with numeric values)

Used by both chat.py (_enhance_context_with_engines) and
verify.py (_build_clean_academic_context).
"""

from __future__ import annotations

from typing import Any

from .ontology import (
    AcademicOntologyGraph,
    ClaimEntity,
    DatasetEntity,
    ExperimentEntity,
    MethodEntity,
    MetricEntity,
)

# Known ML method suffixes for heuristic detection
_METHOD_SUFFIXES = (
    "net",
    "former",
    "gan",
    "bert",
    "transformer",
    "cnn",
    "rnn",
    "lstm",
    "vit",
    "resnet",
    "densenet",
    "inception",
    "yolo",
    "ssd",
    "vgg",
)

# Common benchmark datasets
_KNOWN_DATASETS = {
    "cifar",
    "cifar10",
    "cifar100",
    "imagenet",
    "mnist",
    "squad",
    "squad2",
    "glue",
    "superglue",
    "wmt",
    "cityscapes",
    "coco",
    "pascal",
    "pascal_voc",
    "pubmed",
    "chembl",
    "wikitext",
    "bookcorpus",
}

# Common evaluation metrics
_KNOWN_METRICS = {
    "accuracy",
    "top1",
    "top5",
    "f1",
    "f1_score",
    "bleu",
    "perplexity",
    "ppl",
    "precision",
    "recall",
    "rouge",
    "rouge-l",
    "mse",
    "mae",
    "rmse",
    "mape",
    "map",
    "ndcg",
    "mrr",
    "hit@1",
    "hit@5",
    "auc",
    "iou",
    "dice",
    "psnr",
    "ssim",
}

# Claim-indicating phrases
_CLAIM_PATTERNS = {
    "claim",
    "argue",
    "show that",
    "demonstrate",
    "we hypothesize",
    "we propose",
    "we contend",
    "our method",
    "our approach",
    "we found",
    "we show",
    "we demonstrate",
    "results show",
}


def _extract_methods(line: str) -> list[str]:
    """Detect method names by known suffixes in a line of text."""
    import re as _re

    suffixes = "|".join(_METHOD_SUFFIXES)
    pattern = rf"\b([a-z0-9_-]*(?:{suffixes})[a-z0-9_-]*s?)\b"
    methods = set()
    for match in _re.findall(pattern, line.lower()):
        # Dataset and metric names may share a suffix (for example ImageNet).
        if match in _KNOWN_DATASETS or match in _KNOWN_METRICS:
            continue
        methods.add(match[:-1] if match.endswith("s") and match[:-1] in _METHOD_SUFFIXES else match)
    return sorted(methods)


def _extract_datasets(line: str) -> list[str]:
    """Detect known dataset names in a line of text."""
    import re as _re

    pattern = r"\b(" + "|".join(sorted(_KNOWN_DATASETS, key=len, reverse=True)) + r")\b"
    return list(set(_re.findall(pattern, line.lower())))


def _extract_metrics(line: str) -> list[str]:
    """Detect known metric names in a line of text."""
    import re as _re

    pattern = r"\b(" + "|".join(sorted(_KNOWN_METRICS, key=len, reverse=True)) + r")\b"
    return list(set(_re.findall(pattern, line.lower())))


def _extract_claims(line: str, index: int) -> list[tuple[str, str]]:
    """Detect claim-like sentences. Returns list of (claim_id, statement)."""
    import re as _re

    for phrase in _CLAIM_PATTERNS:
        if _re.search(r"\b" + phrase.replace(" ", r"\s+") + r"\b", line, _re.I):
            return [(f"claim_{index}", line.strip()[:200])]
    return []


def _extract_experiments(line: str, index: int) -> list[ExperimentEntity]:
    """Extract key=value or key:value pairs with numeric values as experiments."""
    import re as _re

    experiments: list[ExperimentEntity] = []
    # Skip known non-experiment keys
    skip_keys = {"page", "size", "n", "num", "count", "id", "index", "max", "min"}

    line_lower = line.lower()
    methods = _extract_methods(line_lower)
    datasets = _extract_datasets(line_lower)
    # Metric identifiers commonly contain digits (for example f1, hits@10, or
    # recall_5). Requiring letters only silently dropped those measurements and
    # weakened the ontology supplied to the reasoning pipeline.
    exp_matches = _re.findall(
        r"\b([a-z][a-z0-9_]*(?:@[0-9]+)?)\s*(?:=|:)\s*(\d+(?:\.\d+)?)\s*%?",
        line_lower,
    )
    for metric, val_str in exp_matches:
        if metric in skip_keys:
            continue
        try:
            val = float(val_str)
            eid = f"exp_{index}_{metric}"
            experiments.append(
                ExperimentEntity(
                    id=eid,
                    paper_id="local",
                    # Preserve standalone key/value semantics: when no named
                    # method is present, the key is more useful than "unknown".
                    method_name=methods[0] if methods else metric,
                    dataset_name=datasets[0] if datasets else "unknown",
                    metric_name=metric,
                    value=val,
                )
            )
        except ValueError:
            pass
    return experiments


def populate_ontology_from_context(
    ontology: AcademicOntologyGraph,
    context_text: str,
    query: str,
    reasoning_engine: Any = None,
    paper_ids: list[str] | None = None,
) -> None:
    """Parse RAG context text to populate ontology entities.

    Scans up to 200 lines of context for methods, datasets, metrics,
    claims, and experiments. Attaches the ontology to the reasoning engine
    if provided.
    """
    if not context_text:
        return

    for i, line in enumerate(context_text.split("\n")[:200]):
        line_lower = line.lower()

        # Methods
        for m in _extract_methods(line_lower):
            m_name = m[0] if isinstance(m, tuple) else m
            m_name = m_name[:50]
            if m_name and m_name not in ontology.methods:
                ontology.methods[m_name] = MethodEntity(name=m_name)

        # Datasets
        for d in _extract_datasets(line_lower):
            if d not in ontology.datasets:
                ontology.datasets[d] = DatasetEntity(name=d)

        # Metrics
        for mt in _extract_metrics(line_lower):
            if mt not in ontology.metrics:
                ontology.metrics[mt] = MetricEntity(name=mt)

        # Claims
        for cid, stmt in _extract_claims(line_lower, i):
            if cid not in ontology.claims:
                ontology.claims[cid] = ClaimEntity(id=cid, paper_id="local", statement=stmt)

        # Experiments
        for exp in _extract_experiments(line_lower, i):
            if exp.id not in ontology.experiments:
                ontology.experiments[exp.id] = exp

    if reasoning_engine is not None:
        reasoning_engine.ontology = ontology


def populate_verify_ontology(
    ontology: AcademicOntologyGraph,
    context_text: str,
    query: str,
    reasoning_engine: Any = None,
    external_data: list | None = None,
) -> None:
    """Populate ontology from verify RAG context + external academic data.

    Similar to populate_ontology_from_context but also parses
    external_data (OpenAlex/CrossRef/SemanticScholar metadata)
    for additional entity mentions.
    """
    # Parse main context first
    populate_ontology_from_context(ontology, context_text or "", query, reasoning_engine)

    # Also parse external data sources for entity mentions
    if external_data:
        for ep in external_data:
            title = getattr(ep, "title", "") or ""
            doi = getattr(ep, "doi", "") or ""
            if title:
                populate_ontology_from_context(ontology, title, query, reasoning_engine)
            if doi:
                populate_ontology_from_context(ontology, doi, query, reasoning_engine)
