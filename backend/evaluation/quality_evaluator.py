"""Deterministic quality metrics for stored AI answers."""

import json
import re
from collections import defaultdict

from common.i18n import infer_language

_CITATION = re.compile(r"\[[^\]]+\]")
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


def evaluate_answer(answer: str, citations: list[dict], expected_language: str = "") -> dict:
    sentences = [part.strip() for part in _SENTENCE.split(answer or "") if len(part.strip()) >= 24]
    cited_sentences = sum(bool(_CITATION.search(sentence)) for sentence in sentences)
    verified = sum(item.get("verification_status") == "verified" for item in citations)
    mapped = sum(bool(item.get("paper_id")) for item in citations)
    invalid_pages = sum(item.get("page_valid") is False for item in citations)
    citation_total = len(citations)
    coverage = cited_sentences / len(sentences) if sentences else 1.0
    verification = verified / citation_total if citation_total else (1.0 if not sentences else 0.0)
    mapping = mapped / citation_total if citation_total else (1.0 if not sentences else 0.0)
    language = infer_language(answer or "", expected_language or "en")
    language_match = not expected_language or language == expected_language
    hallucination_risk = max(0.0, min(1.0, 1 - ((coverage * 0.45) + (verification * 0.4) + (mapping * 0.15))))
    return {
        "citation_coverage": round(coverage, 4),
        "citation_verification": round(verification, 4),
        "citation_mapping": round(mapping, 4),
        "invalid_pages": invalid_pages,
        "language_match": language_match,
        "hallucination_risk": round(hallucination_risk, 4),
    }


def aggregate_history(messages: list) -> dict:
    assistant_rows = [row for row in messages if row.role == "assistant"]
    user_by_session = {}
    model_scores = defaultdict(list)
    scores = []
    language_matches = 0
    for row in messages:
        if row.role == "user":
            user_by_session[row.session_id] = row.content
            continue
        try:
            citations = json.loads(row.citations or "[]")
        except (TypeError, json.JSONDecodeError):
            citations = []
        expected = infer_language(user_by_session.get(row.session_id, ""), "en")
        score = evaluate_answer(row.content, citations if isinstance(citations, list) else [], expected)
        scores.append(score)
        language_matches += int(score["language_match"])
        model_scores[row.model_used or "unknown"].append(score)

    def average(key: str, rows: list[dict]) -> float:
        return round(sum(float(row[key]) for row in rows) / len(rows), 4) if rows else 0.0

    return {
        "answers": len(assistant_rows),
        "citation_coverage": average("citation_coverage", scores),
        "citation_verification": average("citation_verification", scores),
        "citation_mapping": average("citation_mapping", scores),
        "hallucination_risk": average("hallucination_risk", scores),
        "language_consistency": round(language_matches / len(scores), 4) if scores else 1.0,
        "invalid_pages": sum(score["invalid_pages"] for score in scores),
        "models": [
            {
                "model": model,
                "answers": len(rows),
                "citation_verification": average("citation_verification", rows),
                "hallucination_risk": average("hallucination_risk", rows),
            }
            for model, rows in sorted(model_scores.items(), key=lambda item: -len(item[1]))
        ],
    }


def prompt_regression_snapshot() -> dict:
    from chat.prompt_registry import get

    spec = get("rag.answer")
    required = {"{context}", "{query}"}
    missing = sorted(token for token in required if token not in spec.template)
    rendered = spec.render(context="SOURCE", query="QUESTION")
    return {
        "name": spec.name,
        "version": spec.version,
        "passed": not missing and "SOURCE" in rendered and "QUESTION" in rendered,
        "missing_variables": missing,
    }
