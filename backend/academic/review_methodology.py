"""Deterministic methodology and validation for evidence-prioritized reviews."""
from __future__ import annotations

import re
from typing import Iterable

_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
_NUMBERED_CITATION_RE = re.compile(r"\[(\d+)\]")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+|\n+")
_CLAIM_MARKERS = (
    "significant", "increase", "decrease", "improve", "outperform", "result", "found",
    "accuracy", "effect", "association", "correlation", "causal", "demonstrate", "show",
    "đáng kể", "tăng", "giảm", "cải thiện", "vượt trội", "kết quả", "cho thấy",
    "độ chính xác", "hiệu quả", "tác động", "liên quan", "tương quan", "nguyên nhân",
)
_SYNTHESIS_KEYS = {"methodology_comparison", "findings", "comparative_synthesis", "study_characteristics"}


def academic_fallback_outline(lang: str = "vi") -> list[dict]:
    localized = {
        "vi": [
            ("review_scope", "1. Phạm vi và câu hỏi đánh giá", "Xác định mục tiêu, phạm vi, câu hỏi và giới hạn của tập tài liệu được chọn."),
            ("conceptual_background", "2. Nền tảng khái niệm", "Trình bày khái niệm và bối cảnh cần thiết để diễn giải bằng chứng."),
            ("study_characteristics", "3. Đặc điểm các nghiên cứu", "Mô tả thiết kế, đối tượng, dữ liệu, bối cảnh và mục tiêu của từng nghiên cứu."),
            ("methodology_comparison", "4. Thẩm định phương pháp", "So sánh thiết kế, phép đo, quy trình phân tích, độ tin cậy và nguy cơ sai lệch."),
            ("comparative_synthesis", "5. Tổng hợp và so sánh kết quả", "Tổng hợp điểm đồng thuận, khác biệt và mức độ được bằng chứng hỗ trợ giữa các nghiên cứu."),
            ("limitations", "6. Hạn chế và nguy cơ sai lệch", "Phân tích hạn chế của từng nghiên cứu và giới hạn của chính bài đánh giá."),
            ("research_gaps", "7. Khoảng trống và hướng nghiên cứu", "Suy ra khoảng trống trực tiếp từ bằng chứng còn thiếu, mâu thuẫn hoặc chưa chắc chắn."),
            ("conclusion", "8. Kết luận", "Trả lời câu hỏi đánh giá, nêu mức độ chắc chắn và tránh khái quát vượt quá bằng chứng."),
        ],
        "en": [
            ("review_scope", "1. Review scope and questions", "Define the objective, scope, questions, and limits of the selected evidence set."),
            ("conceptual_background", "2. Conceptual background", "Present concepts and context required to interpret the evidence."),
            ("study_characteristics", "3. Study characteristics", "Describe each study's design, population, data, setting, and objective."),
            ("methodology_comparison", "4. Methodological appraisal", "Compare design, measurement, analysis, reliability, and risk of bias."),
            ("comparative_synthesis", "5. Comparative synthesis of findings", "Synthesize agreement, disagreement, and strength of support across studies."),
            ("limitations", "6. Limitations and risk of bias", "Assess study-level limitations and limitations of this review."),
            ("research_gaps", "7. Evidence gaps and future research", "Derive gaps from missing, conflicting, or uncertain evidence."),
            ("conclusion", "8. Conclusion", "Answer the review questions, state certainty, and avoid overgeneralization."),
        ],
    }
    rows = localized.get(lang, localized["en"])
    sections = [{"key": key, "title": title, "description": desc, "subheadings": []} for key, title, desc in rows]
    references = {
        "vi": ("9. Tài liệu tham khảo", "Danh mục đầy đủ các tài liệu được trích dẫn trong bài đánh giá."),
        "en": ("9. References", "Complete list of sources cited in the review."),
        "ja": ("9. 参考文献", "レビューで引用した文献の完全な一覧。"),
    }.get(lang, ("9. References", "Complete list of sources cited in the review."))
    sections.append({"key": "bibliography", "title": references[0], "description": references[1], "subheadings": []})
    return sections


def normalize_outline(sections: object, lang: str = "vi") -> list[dict]:
    """Validate an AI outline and enforce the minimum academic review functions."""
    if not isinstance(sections, list):
        return []
    normalized: list[dict] = []
    seen: set[str] = set()
    for item in sections:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip().lower()
        title = str(item.get("title", "")).strip()
        description = str(item.get("description", "")).strip()
        if not _KEY_RE.fullmatch(key) or key in seen or not title or not description:
            continue
        seen.add(key)
        normalized.append({"key": key, "title": title, "description": description})
    non_bibliography = [item for item in normalized if item["key"] != "bibliography"]
    if not 4 <= len(non_bibliography) <= 8:
        return []
    semantic_text = " ".join(
        f"{item['key']} {item['title']} {item['description']}".lower()
        for item in non_bibliography
    )
    required_roles = (
        ("scope", "question", "phạm vi", "câu hỏi", "objective"),
        ("background", "concept", "nền tảng", "bối cảnh"),
        ("method", "design", "phương pháp", "thiết kế", "appraisal"),
        ("finding", "result", "synthesis", "kết quả", "tổng hợp", "so sánh"),
        ("limitation", "bias", "hạn chế", "sai lệch"),
        ("gap", "future", "khoảng trống", "hướng nghiên cứu"),
        ("conclusion", "kết luận"),
    )
    if any(not any(term in semantic_text for term in role) for role in required_roles):
        return []
    if "bibliography" not in seen:
        fallback_bib = academic_fallback_outline(lang)[-1]
        normalized.append(fallback_bib)
    return normalized


def section_retrieval_query(section: str, title: str, description: str) -> str:
    return " ".join(filter(None, [
        title, description,
        "research objective study design population sample dataset methodology measurement analysis results effect size limitations bias uncertainty",
    ]))


def custom_section_request(section: str, title: str, description: str, paper_titles: Iterable[str], rules: Iterable[str]) -> str:
    sources = "\n".join(f"- {name}" for name in paper_titles)
    policy = "\n".join(f"- {rule}" for rule in rules)
    return f"""Write the academic review section defined by this structured specification.
Section ID: {section}
Section title: {title}
Analytical purpose: {description}

Required method:
- Synthesize across studies; do not write isolated paper summaries unless comparison requires it.
- Separate reported evidence from interpretation.
- Attach a source marker [exact paper title] to every empirical, numerical, comparative, or causal claim.
- Report disagreement, missing evidence, and uncertainty explicitly.
- Never invent a sample, dataset, method, result, limitation, or citation.
- If the excerpts do not support a claim, state that the evidence is insufficient.

Eligible sources:
{sources}

Academic governance:
{policy}
"""


def deterministic_quality_issues(
    sections: dict[str, dict],
    outline_sections: list[dict] | None = None,
    selected_paper_ids: Iterable[str] = (),
    lang: str = "vi",
) -> tuple[list[dict], dict]:
    """Audit observable academic properties without asking an LLM to judge itself."""
    issues: list[dict] = []
    selected = set(selected_paper_ids)
    outline = outline_sections or [{"key": key, "title": key} for key in sections]
    labels = {
        "vi": {
            "missing": "Mục bắt buộc chưa có nội dung.",
            "citation": "Mục có nội dung nhưng không có trích dẫn kiểm chứng được.",
            "invalid_ref": "Có ký hiệu trích dẫn không ánh xạ tới nguồn của mục.",
            "foreign": "Trích dẫn tham chiếu tài liệu ngoài tập bài báo đã chọn.",
            "diversity": "Mục tổng hợp chưa đối chiếu bằng chứng từ ít nhất hai nghiên cứu.",
            "claim": "Tỷ lệ phát biểu thực chứng có trích dẫn còn thấp ({coverage}%).",
        },
        "en": {
            "missing": "Required section has no content.",
            "citation": "Section has content but no verifiable citation.",
            "invalid_ref": "A citation marker does not map to a section source.",
            "foreign": "A citation references a paper outside the selected evidence set.",
            "diversity": "Synthesis section does not compare evidence from at least two studies.",
            "claim": "Citation coverage for empirical claims is low ({coverage}%).",
        },
    }.get(lang)
    if not labels:
        labels = {
            "missing": "Required section has no content.", "citation": "Section has content but no verifiable citation.",
            "invalid_ref": "A citation marker does not map to a section source.", "foreign": "A citation references a paper outside the selected evidence set.",
            "diversity": "Synthesis section does not compare evidence from at least two studies.",
            "claim": "Citation coverage for empirical claims is low ({coverage}%).",
        }

    checked = 0
    cited_claims = 0
    total_claims = 0
    cited_papers: set[str] = set()
    for spec in outline:
        key = str(spec.get("key", ""))
        if key == "bibliography":
            continue
        data = sections.get(key) or {}
        content = str(data.get("content", "")).strip()
        citations = data.get("citations") if isinstance(data.get("citations"), list) else []
        if not content:
            issues.append(_issue("high", key, "missing_section", labels["missing"], "regenerate"))
            continue
        checked += 1
        if not citations or not _NUMBERED_CITATION_RE.search(content):
            issues.append(_issue("high", key, "missing_citation", labels["citation"], "regenerate"))
        refs = [int(value) for value in _NUMBERED_CITATION_RE.findall(content)]
        if any(ref < 1 or ref > len(citations) for ref in refs):
            issues.append(_issue("high", key, "invalid_citation", labels["invalid_ref"], "regenerate"))
        section_papers = {str(c.get("paper_id", "")) for c in citations if isinstance(c, dict) and c.get("paper_id")}
        cited_papers.update(section_papers)
        if selected and section_papers - selected:
            issues.append(_issue("high", key, "citation_outside_scope", labels["foreign"], "regenerate"))
        if len(selected) >= 2 and (key in _SYNTHESIS_KEYS or "compar" in key or "synth" in key) and len(section_papers) < 2:
            issues.append(_issue("medium", key, "insufficient_synthesis", labels["diversity"], "regenerate"))
        for sentence in _SENTENCE_RE.split(content):
            lower = sentence.lower()
            is_claim = bool(re.search(r"\d", sentence)) or any(marker in lower for marker in _CLAIM_MARKERS)
            if not is_claim:
                continue
            total_claims += 1
            if _NUMBERED_CITATION_RE.search(sentence):
                cited_claims += 1
    coverage = round((cited_claims / total_claims) * 100) if total_claims else 100
    if total_claims >= 2 and coverage < 60:
        issues.append(_issue("high", "global", "low_claim_citation_coverage", labels["claim"].format(coverage=coverage), "none"))
    metrics = {
        "required_sections": len([s for s in outline if s.get("key") != "bibliography"]),
        "completed_sections": checked,
        "claim_citation_coverage": coverage,
        "cited_papers": len(cited_papers),
        "selected_papers": len(selected),
        "deterministic": True,
    }
    return issues, metrics


def _issue(severity: str, section: str, issue_type: str, message: str, action: str) -> dict:
    return {
        "severity": severity,
        "section": section,
        "type": issue_type,
        "message": message,
        "action": action,
        "action_label": "Regenerate" if action == "regenerate" else "",
        "source": "deterministic_academic_audit",
    }