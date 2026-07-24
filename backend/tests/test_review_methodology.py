from academic.review_methodology import (
    academic_fallback_outline,
    deterministic_quality_issues,
    normalize_outline,
)


def test_academic_fallback_has_required_review_functions_and_references():
    outline = academic_fallback_outline("vi")
    keys = [item["key"] for item in outline]
    assert keys == [
        "review_scope",
        "conceptual_background",
        "study_characteristics",
        "methodology_comparison",
        "comparative_synthesis",
        "limitations",
        "research_gaps",
        "conclusion",
        "bibliography",
    ]


def test_normalize_outline_rejects_generic_outline_without_academic_roles():
    generic = [
        {"key": f"part_{index}", "title": f"Part {index}", "description": "General discussion"} for index in range(1, 6)
    ]
    assert normalize_outline(generic, "en") == []


def test_deterministic_audit_rejects_unmapped_and_out_of_scope_citations():
    outline = [
        {"key": "comparative_synthesis", "title": "Synthesis", "description": "Compare findings"},
    ]
    sections = {
        "comparative_synthesis": {
            "content": "Accuracy increased to 91% [2].",
            "citations": [{"paper_id": "outside", "paper_title": "Other", "citation_text": "Other"}],
        }
    }
    issues, metrics = deterministic_quality_issues(sections, outline, ["paper-a", "paper-b"], "en")
    types = {item["type"] for item in issues}
    assert "invalid_citation" in types
    assert "citation_outside_scope" in types
    assert "insufficient_synthesis" in types
    assert metrics["deterministic"] is True
    assert metrics["passed"] if "passed" in metrics else True
