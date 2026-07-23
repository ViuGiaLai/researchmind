import asyncio

from routers.chat import _chat_cache_key, _sanitize_public_answer, analyze_claims


def test_internal_engine_protocol_is_not_public():
    raw = (
        "=== EVIDENCE ANALYSIS (Rule-based) ===\n"
        "SUPPORTED | conf=80% | hidden provenance\n"
        "Retrieved Evidence Corpus (Verified)\n"
        "Public conclusion [Paper A]."
    )
    result = _sanitize_public_answer(raw)
    assert "EVIDENCE ANALYSIS" not in result
    assert "Retrieved Evidence Corpus" not in result
    assert "Public conclusion" in result


def test_cache_key_contains_pipeline_version():
    key = _chat_cache_key("question", ["paper-1"], "current", None)
    assert "academic-boundary-v2" in key


def test_claim_audit_separates_coverage_from_semantic_support():
    result = asyncio.run(analyze_claims({
        "text": "A meaningful result is reported [1]. This second claim has no source.",
        "citations": [{
            "paper_id": "paper-1",
            "entailment_status": "entailed",
            "entailment_score": 0.82,
        }],
    }))
    analysis = result["analysis"]
    assert analysis["citation_coverage_score"] == 50
    assert analysis["supported_claims"] == 1
    assert analysis["evidence_support_score"] > 0
    assert analysis["confidence_score"] == analysis["citation_coverage_score"]
