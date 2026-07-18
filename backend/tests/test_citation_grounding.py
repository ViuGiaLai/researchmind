from routers.chat import _process_citations


def test_process_citations_marks_retrieved_passage_as_verified():
    source = "paper.pdf"
    answer, citations = _process_citations(
        "The intervention improved outcomes [paper.pdf, trang 4].",
        [{"source": source, "page": 4, "text": "[paper.pdf, trang 4]"}],
        {source: "paper-id"},
        {(source, 4): {"text_snippet": "The intervention improved outcomes.", "paper_title": "Paper"}},
        {"paper-id": 12},
    )

    assert answer.endswith("[1].")
    assert citations[0]["paper_id"] == "paper-id"
    assert citations[0]["verification_status"] == "verified"
    assert citations[0]["grounding_score"] == 1.0
    assert citations[0]["page_valid"] is True


def test_process_citations_rejects_unknown_source_without_page():
    answer, citations = _process_citations(
        "Unsupported [invented source].",
        [{"source": "invented source", "page": None, "text": "[invented source]"}],
        {},
        {},
        {},
    )

    assert answer == "Unsupported [invented source]."
    assert citations == []
