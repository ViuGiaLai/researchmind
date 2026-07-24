from types import SimpleNamespace

from evaluation.quality_evaluator import aggregate_history, evaluate_answer, prompt_regression_snapshot


def test_grounded_answer_scores_better_than_uncited_answer():
    citations = [{"paper_id": "paper-1", "verification_status": "verified", "page_valid": True}]
    grounded = evaluate_answer("The intervention improved accuracy [Paper, page 2].", citations, "en")
    unsupported = evaluate_answer("The intervention improved accuracy substantially.", [], "en")
    assert grounded["citation_verification"] == 1.0
    assert grounded["hallucination_risk"] < unsupported["hallucination_risk"]


def test_multilingual_and_model_aggregation():
    rows = [
        SimpleNamespace(role="user", session_id="s", content="Kết quả chính là gì?", citations="[]", model_used=""),
        SimpleNamespace(
            role="assistant",
            session_id="s",
            content="Kết quả tăng rõ rệt [Bài báo, trang 2].",
            citations='[{"paper_id":"p","verification_status":"verified","page_valid":true}]',
            model_used="model-a",
        ),
    ]
    report = aggregate_history(rows)
    assert report["language_consistency"] == 1.0
    assert report["models"][0]["model"] == "model-a"


def test_prompt_contract_regression():
    assert prompt_regression_snapshot()["passed"] is True
