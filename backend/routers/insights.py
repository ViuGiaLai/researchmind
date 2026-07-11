import asyncio
import json
from fastapi import APIRouter, Body, Request
from loguru import logger

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import CollectionPaper
from academic.paper_check import check_papers_ready
from common.rag_ready import rag_unavailable_message
from common.i18n import t, get_language, get_output_language_name

router = APIRouter(prefix="/api/insights", tags=["Insights"])


def _empty_insight_answer(answer: str) -> dict:
    return {
        "answer": answer,
        "citations": [],
        "model_used": "",
        "papers_used": [],
        "chunks_used": 0,
    }


def _resolve_insight_paper_ids(body: dict) -> list[str] | None:
    paper_ids = body.get("paper_ids")
    collection_id = body.get("collection_id")
    if collection_id and not paper_ids:
        session = get_session(state.engine)
        try:
            paper_ids = [
                row.paper_id
                for row in session.query(CollectionPaper.paper_id)
                .filter(CollectionPaper.collection_id == collection_id)
                .all()
            ]
        finally:
            session.close()
    return paper_ids


def _insight_preflight(paper_ids, lang: str = "vi") -> dict | None:
    rag_error = rag_unavailable_message(lang)
    if rag_error:
        return _empty_insight_answer(rag_error)
    paper_error = check_papers_ready(paper_ids, lang)
    if paper_error:
        return _empty_insight_answer(paper_error)
    return None


@router.post("/gap")
async def find_research_gap(request: Request, body: dict = Body(...)):
    """
    Find research gaps across indexed papers.
    Uses RAG to retrieve relevant chunks, then LLM analyzes what's missing.
    """
    lang = get_language(request)
    paper_ids = _resolve_insight_paper_ids(body)
    preflight = _insight_preflight(paper_ids, lang)
    if preflight:
        return preflight

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="research methodology findings results limitations future work gaps unexplored areas weaknesses",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": t("insights.insufficient_data", lang),
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    gap_prompt = f"""Phân tích research gap từ các paper. Với mỗi gap, nêu vấn đề và nguyên nhân chưa giải quyết.

## 🔍 Research Gap Analysis
1. **Lỗ hổng nghiên cứu chính** — vấn đề chưa được giải quyết
2. **Điểm yếu chung** — hạn chế nhiều paper cùng gặp
3. **Hướng nghiên cứu mới** — 2-3 hướng dựa trên lỗ hổng
4. **Cơ hội đóng góp** — nghiên cứu sinh có thể làm gì ngay

Trích dẫn [Tên Paper] cho mỗi claim. Trả lời bằng {get_output_language_name(lang)}."""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=gap_prompt,
        context_text=retrieval.context_text,
        task_type="gap",
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.post("/conflict")
async def find_conflicts(request: Request, body: dict = Body(...)):
    """
    Find contradictions and conflicts between papers.
    Uses RAG to retrieve diverse chunks, then LLM compares claims.
    """
    lang = get_language(request)
    paper_ids = _resolve_insight_paper_ids(body)
    preflight = _insight_preflight(paper_ids, lang)
    if preflight:
        return preflight

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="findings conclusions results claims arguments methodology approach results show demonstrate suggest",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": t("insights.insufficient_data", lang),
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    conflict_prompt = f"""Phân tích mâu thuẫn và xung đột giữa các paper.

## ⚠️ Conflict Analysis
1. **Mâu thuẫn trực tiếp** — Paper nào đối lập nhau? Paper A nói X, Paper B nói Y
2. **Khác biệt phương pháp** — Cùng vấn đề, phương pháp khác nhau?
3. **Kết quả mâu thuẫn** — Cùng vấn đề, kết quả khác nhau?
4. **Góc nhìn đa chiều** — Cách tiếp cận từ nhiều hướng?
5. **Cơ hội từ mâu thuẫn** — Nên ưu tiên giải quyết mâu thuẫn nào?

Trích dẫn [Tên Paper] cho mỗi claim. Trả lời bằng {get_output_language_name(lang)}."""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=conflict_prompt,
        context_text=retrieval.context_text,
        task_type="insight",
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.post("/topic")
async def suggest_topics(request: Request, body: dict = Body(...)):
    """
    Suggest research topics based on papers in the library.
    Uses RAG to retrieve diverse chunks, then LLM generates topic suggestions.
    """
    lang = get_language(request)
    paper_ids = _resolve_insight_paper_ids(body)
    preflight = _insight_preflight(paper_ids, lang)
    if preflight:
        return preflight

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="research topic methodology findings results future work direction novel approach innovative",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": t("insights.insufficient_data", lang),
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    topic_prompt = f"""Phân tích và đề xuất đề tài nghiên cứu dựa trên thư viện paper.

KHÔNG dùng **bold** hay markdown. Chỉ dùng plain text.
Trả lời theo cấu trúc sau, dùng dấu xuống dòng để phân cách:

Research Topic Suggestions

1. Tổng quan lĩnh vực — xu hướng chính, lĩnh vực con
2. Đề xuất 3-5 đề tài — mỗi đề tài: tên, mô tả, tầm quan trọng, phương pháp
3. Top Pick — chọn 1 đề tài tốt nhất, giải thích chi tiết
4. Bước tiếp theo — nên đọc thêm paper/phương pháp nào

Trích dẫn [Tên Paper] khi cần. Trả lời bằng {get_output_language_name(lang)}."""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=topic_prompt,
        context_text=retrieval.context_text,
        task_type="insight",
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.post("/evolution")
async def find_evolution_map(request: Request, body: dict = Body(...)):
    """
    Analyze research evolution across papers.
    Uses RAG to retrieve diverse chunks, then LLM maps the evolution of ideas.
    """
    lang = get_language(request)
    paper_ids = _resolve_insight_paper_ids(body)
    preflight = _insight_preflight(paper_ids, lang)
    if preflight:
        return preflight

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="research evolution development history background methodology findings results improvement advancement novel approach future direction",
        paper_ids=paper_ids,
        top_k=20,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": t("insights.insufficient_data", lang),
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    evolution_prompt = f"""Phân tích và vẽ bản đồ phát triển nghiên cứu. Sắp xếp theo thời gian (cũ → mới).

## 🧬 Evolution Map
1. **Tổng quan xu hướng** — sự phát triển của lĩnh vực
2. **Dòng phát triển ý tưởng** — từng giai đoạn: paper đại diện, ý tưởng chính, điểm mới
3. **Bước ngoặt quan trọng** — phát hiện/phương pháp thay đổi hướng nghiên cứu
4. **Sơ đồ quan hệ** — paper nào kế thừa/liên quan đến nhau
5. **Dự đoán tương lai** — xu hướng tiếp theo, kỹ năng cần chuẩn bị

Trích dẫn [Tên Paper] cho mỗi giai đoạn. Trả lời bằng {get_output_language_name(lang)}."""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=evolution_prompt,
        context_text=retrieval.context_text,
        task_type="insight",
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.post("/compare")
async def compare_papers(request: Request, body: dict = Body(...)):
    """
    Compare multiple selected papers side-by-side.
    Uses concurrent LLM calls to extract Objective, Methodology, Dataset, Findings, and Limitations.
    """
    lang = get_language(request)
    paper_ids = _resolve_insight_paper_ids(body)

    if not paper_ids or len(paper_ids) < 2:
        return {
            "answer": t("insights.select_min_two", lang),
            "citations": [],
            "model_used": "",
            "papers_used": [],
            "chunks_used": 0,
            "matrix": {"columns": [], "rows": []}
        }

    preflight = _insight_preflight(paper_ids, lang)
    if preflight:
        preflight["matrix"] = {"columns": [], "rows": []}
        return preflight

    # Fetch paper titles from DB
    from db.database import get_session
    from db.models import Paper
    session = get_session(state.engine)
    try:
        papers_db = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        paper_titles = {p.id: p.title or p.filename for p in papers_db}
    finally:
        session.close()

    # Define extraction helper
    async def extract_single_paper(paper_id: str, title: str):
        retrieval = await asyncio.to_thread(
            state.retriever.retrieve,
            query="abstract introduction methodology experimental results dataset conclusion limitations weaknesses",
            paper_ids=[paper_id],
            top_k=8,
        )
        if not retrieval.context_text.strip():
            return {
                "id": paper_id,
                "title": title,
                "data": {
                    "objective": t("insights.no_text_data_objective", lang),
                    "methodology": t("insights.no_text_data_methodology", lang),
                    "dataset": t("insights.no_text_data_dataset", lang),
                    "findings": t("insights.no_text_data_findings", lang),
                    "limitations": t("insights.no_text_data_limitations", lang)
                },
                "model_used": "none"
            }
        
        prompt = f"""Bạn là một chuyên gia nghiên cứu khoa học. Hãy đọc kỹ các đoạn trích từ bài nghiên cứu "{title}" sau và trích xuất thông tin tóm tắt cực kỳ ngắn gọn (mỗi phần từ 1 đến 3 câu) dưới dạng JSON object.
Bạn phải trả về đúng cấu trúc JSON sau:
{{
  "objective": "Mục tiêu nghiên cứu chính của bài báo",
  "methodology": "Phương pháp nghiên cứu, thuật toán hoặc mô hình áp dụng",
  "dataset": "Dữ liệu sử dụng và cấu hình thực nghiệm",
  "findings": "Các kết quả hoặc phát hiện cốt lõi đạt được",
  "limitations": "Hạn chế hoặc điểm yếu chính của nghiên cứu"
}}

Yêu cầu quan trọng: CHỈ trả về duy nhất 1 JSON object hợp lệ, không có bất kỳ văn bản giải thích nào khác ở ngoài. Tất cả các nội dung trích xuất viết bằng {get_output_language_name(lang)}.

Đoạn trích từ bài báo:\n{retrieval.context_text}"""

        generation = await asyncio.to_thread(
            state.generator.generate,
            query=prompt,
            context_text=retrieval.context_text,
            task_type="insight",
        )
        
        content = (generation.content or "").strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        
        data = {}
        try:
            start = content.find('{')
            end = content.rfind('}')
            if start != -1 and end != -1:
                data = json.loads(content[start:end+1])
        except Exception as e:
            logger.warning(f"Failed to parse LLM comparison JSON for {title}: {e}")
            fallback_text = content.strip()
            extract_failed = t("insights.extract_failed", lang)
            data = {
                "objective": fallback_text[:500] if fallback_text else extract_failed,
                "methodology": "LLM trả về JSON không hợp lệ; xem phần mục tiêu để đọc fallback text.",
                "dataset": extract_failed,
                "findings": fallback_text[:500] if fallback_text else extract_failed,
                "limitations": extract_failed,
            }
            
        for key in ["objective", "methodology", "dataset", "findings", "limitations"]:
            if key not in data or not str(data[key]).strip():
                data[key] = t("insights.extract_failed", lang)
                
        return {
            "id": paper_id,
            "title": title,
            "data": data,
            "model_used": generation.model_used
        }

    # Extract paper info concurrently
    tasks = []
    for pid in paper_ids:
        title = paper_titles.get(pid, f"Paper {pid[:6]}")
        tasks.append(extract_single_paper(pid, title))
        
    results = await asyncio.gather(*tasks)

    # Format into columns & rows for frontend table
    columns = ["Tiêu chí"]
    for res in results:
        columns.append(res["title"])
        
    rows = [
        ["🎯 Mục tiêu nghiên cứu", *[res["data"]["objective"] for res in results]],
        ["⚙️ Phương pháp", *[res["data"]["methodology"] for res in results]],
        ["📊 Dữ liệu & Thực nghiệm", *[res["data"]["dataset"] for res in results]],
        ["🔬 Kết quả chính", *[res["data"]["findings"] for res in results]],
        ["⚠️ Hạn chế & Điểm yếu", *[res["data"]["limitations"] for res in results]]
    ]

    # Build markdown table for synthesis/exporting
    md = f"## 📊 Ma trận so sánh tài liệu (Document Comparison Matrix)\n\n"
    md += "| " + " | ".join(columns) + " |\n"
    md += "| " + " | ".join(["---"] * len(columns)) + " |\n"
    for r in rows:
        cells = [c.replace("\n", " ") for c in r]
        md += "| " + " | ".join(cells) + " |\n"

    model_used = ", ".join(list(set([res["model_used"] for res in results if res["model_used"]])))

    return {
        "answer": md,
        "citations": [],
        "model_used": model_used or "hybrid",
        "papers_used": paper_ids,
        "chunks_used": len(paper_ids) * 8,
        "matrix": {
            "columns": columns,
            "rows": rows
        }
    }
