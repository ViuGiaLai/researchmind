from routers.chat import _process_citations
from chat.retriever import Retriever


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


def test_context_uses_readable_canonical_source_label():
    retriever = Retriever(None, postprocessors=[])
    context = retriever._build_context([
        {
            "paper_id": "12345678-1234-1234-1234-123456789abc",
            "paper_title": "Shared title",
            "page_number": 7,
            "content": "Evidence from the selected paper.",
        }
    ])

    assert "[Shared title, page 7]" in context


def test_uuid_prefixed_citation_resolves_correct_paper():
    paper_id = "12345678-1234-1234-1234-123456789abc"
    source = f"{paper_id}_Shared title"
    answer, citations = _process_citations(
        f"Supported claim [{source}, page 7].",
        [{"source": source, "page": 7, "text": f"[{source}, page 7]"}],
        {paper_id: paper_id},
        {
            (paper_id, 7): {
                "text_snippet": "Supported claim.",
                "paper_title": "Shared title",
            }
        },
        {paper_id: 10},
    )

    assert answer == "Supported claim [1]."
    assert citations[0]["paper_id"] == paper_id
    assert citations[0]["paper_title"] == "Shared title"
    assert citations[0]["page_valid"] is True
