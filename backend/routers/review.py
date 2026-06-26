"""
ResearchMind VN — Literature Review Builder.

POST /api/review/builder/outline  → Generate dynamic outline from papers
POST /api/review/builder/evidence → Get evidence count for a section
POST /api/review/builder/draft    → Generate full review draft (all sections)
POST /api/review/builder/section  → Generate/regenerate a single section
POST /api/review/builder/matrix   → Generate comparison matrix
POST /api/review/builder/export   → Export full review as DOCX/HTML/Markdown
"""
import asyncio
import json
import re
from datetime import datetime
from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse
from loguru import logger

from app_state import state
from academic.paper_check import check_papers_ready
from db.database import get_session
from db.models import Paper, ReviewDraft

def _parse_authors(authors_str: str) -> list[str]:
    if not authors_str:
        return []
    try:
        val = json.loads(authors_str)
        if isinstance(val, list):
            return val
    except (json.JSONDecodeError, TypeError):
        pass
    
    try:
        val = json.loads(authors_str.replace("'", '"'))
        if isinstance(val, list):
            return val
    except Exception:
        pass
        
    import re
    cleaned = re.sub(r"[\[\]'\"#]", "", authors_str)
    return [a.strip() for a in cleaned.split(",") if a.strip()]


router = APIRouter(prefix="/api/review/builder", tags=["review"])

REVIEW_SECTIONS = [
    "background",
    "related_work",
    "methodology_comparison",
    "findings",
    "limitations",
    "research_gaps",
    "future_directions",
    "bibliography",
]

SECTION_TITLES = {
    "background": "1. Background",
    "related_work": "2. Related Work",
    "methodology_comparison": "3. Methodology Comparison",
    "findings": "4. Findings",
    "limitations": "5. Limitations",
    "research_gaps": "6. Research Gaps",
    "future_directions": "7. Future Directions",
    "bibliography": "8. Bibliography",
}

SECTION_CONFIG = {
    "background": {
        "query": "background introduction overview context motivation problem statement survey",
        "prompt": """Bạn là một chuyên gia viết Literature Review. Dựa trên các đoạn trích từ tài liệu nghiên cứu dưới đây, hãy viết một phần "Background" (Bối cảnh nghiên cứu) cho một bài Literature Review bằng tiếng Việt.

Yêu cầu:
- Giới thiệu lĩnh vực nghiên cứu và tầm quan trọng của nó
- Giải thích các khái niệm và thuật ngữ chính
- Trình bày bối cảnh lịch sử và sự phát triển của lĩnh vực
- Nêu động lực và lý do nghiên cứu

Viết khoảng 300-500 từ, văn phong học thuật. Sử dụng trích dẫn theo định dạng [Tên Paper] khi trích dẫn từ tài liệu."""
    },
    "related_work": {
        "query": "related work existing approaches previous studies literature survey comparison state of the art",
        "prompt": """Bạn là một chuyên gia viết Literature Review. Dựa trên các đoạn trích từ tài liệu nghiên cứu dưới đây, hãy viết một phần "Related Work" (Công trình liên quan) cho một bài Literature Review bằng tiếng Việt.

Yêu cầu:
- Tổng quan các phương pháp và cách tiếp cận hiện có
- So sánh các trường phái nghiên cứu khác nhau
- Nêu bật các đóng góp chính từ các công trình trước đây
- Chỉ ra sự phát triển của lĩnh vực theo thời gian

Viết khoảng 300-500 từ, văn phong học thuật. Sử dụng trích dẫn theo định dạng [Tên Paper]."""
    },
    "methodology_comparison": {
        "query": "methodology approach method framework model architecture algorithm technique experimental setup",
        "prompt": """Bạn là một chuyên gia viết Literature Review. Dựa trên các đoạn trích từ tài liệu nghiên cứu dưới đây, hãy viết một phần "Methodology Comparison" (So sánh phương pháp) cho một bài Literature Review bằng tiếng Việt.

Yêu cầu:
- So sánh các phương pháp nghiên cứu được sử dụng trong các paper
- Phân tích ưu điểm và nhược điểm của từng phương pháp
- So sánh kiến trúc mô hình, thuật toán, hoặc quy trình thực nghiệm
- Đánh giá tính phù hợp của từng phương pháp cho các bài toán khác nhau

Viết khoảng 300-500 từ, văn phong học thuật. Sử dụng trích dẫn theo định dạng [Tên Paper]."""
    },
    "findings": {
        "query": "findings results experimental results performance evaluation benchmark comparison outcomes",
        "prompt": """Bạn là một chuyên gia viết Literature Review. Dựa trên các đoạn trích từ tài liệu nghiên cứu dưới đây, hãy viết một phần "Findings" (Kết quả nghiên cứu) cho một bài Literature Review bằng tiếng Việt.

Yêu cầu:
- Trình bày các kết quả chính từ các nghiên cứu
- So sánh hiệu năng giữa các phương pháp khác nhau
- Phân tích các chỉ số đánh giá và benchmark
- Tổng hợp các phát hiện quan trọng

Viết khoảng 300-500 từ, văn phong học thuật. Sử dụng trích dẫn theo định dạng [Tên Paper]."""
    },
    "limitations": {
        "query": "limitations weaknesses challenges drawbacks assumptions constraints shortcomings",
        "prompt": """Bạn là một chuyên gia viết Literature Review. Dựa trên các đoạn trích từ tài liệu nghiên cứu dưới đây, hãy viết một phần "Limitations" (Hạn chế) cho một bài Literature Review bằng tiếng Việt.

Yêu cầu:
- Phân tích các hạn chế và điểm yếu của các nghiên cứu hiện có
- Chỉ ra các giả định và ràng buộc trong từng phương pháp
- Đánh giá tính tổng quát và khả năng áp dụng thực tế
- Thảo luận về các thách thức chưa được giải quyết

Viết khoảng 200-400 từ, văn phong học thuật. Sử dụng trích dẫn theo định dạng [Tên Paper]."""
    },
    "research_gaps": {
        "query": "research gaps open problems future work unexplored areas missing limitations opportunities",
        "prompt": """Bạn là một chuyên gia viết Literature Review. Dựa trên các đoạn trích từ tài liệu nghiên cứu dưới đây, hãy viết một phần "Research Gaps" (Khoảng trống nghiên cứu) cho một bài Literature Review bằng tiếng Việt.

Yêu cầu:
- Xác định các khoảng trống nghiên cứu chính trong lĩnh vực
- Phân tích những vấn đề chưa được giải quyết
- Đề xuất các hướng nghiên cứu tiềm năng
- Kết nối các hạn chế hiện tại với cơ hội nghiên cứu trong tương lai

Viết khoảng 200-400 từ, văn phong học thuật. Sử dụng trích dẫn theo định dạng [Tên Paper]."""
    },
    "future_directions": {
        "query": "future directions recommendations emerging trends opportunities next steps outlook",
        "prompt": """Bạn là một chuyên gia viết Literature Review. Dựa trên các đoạn trích từ tài liệu nghiên cứu dưới đây, hãy viết một phần "Future Directions" (Hướng phát triển tương lai) cho một bài Literature Review bằng tiếng Việt.

Yêu cầu:
- Đề xuất các hướng nghiên cứu trong tương lai
- Thảo luận về các xu hướng mới nổi trong lĩnh vực
- Đưa ra khuyến nghị cho các nhà nghiên cứu
- Kết nối các phát hiện hiện tại với tiềm năng phát triển

Viết khoảng 200-400 từ, văn phong học thuật. Sử dụng trích dẫn theo định dạng [Tên Paper]."""
    },
}


# ─── Citation Extraction ─────────────────────────────────────

def extract_citations(content: str, paper_titles: dict[str, str]) -> list[dict]:
    """Parse [Paper Name] citations from generated content.
    Returns list of {paper_id, paper_title, citation_text}.
    """
    citations = []
    pattern = r'\[([^\]]+?)\]'
    seen = set()
    for match in re.finditer(pattern, content):
        title_match = match.group(1).strip()
        for pid, ptitle in paper_titles.items():
            if ptitle and (title_match.lower() in ptitle.lower() or ptitle.lower() in title_match.lower()):
                key = f"{pid}:{title_match}"
                if key not in seen:
                    seen.add(key)
                    citations.append({
                        "paper_id": pid,
                        "paper_title": ptitle,
                        "citation_text": title_match,
                    })
                break
    return citations


# ─── Section Generation ──────────────────────────────────────

async def _generate_section(paper_ids: list[str], section: str, paper_titles: dict) -> dict:
    """Generate a single section of the literature review."""
    if section == "bibliography":
        return await _generate_bibliography(paper_ids, paper_titles)

    config = SECTION_CONFIG.get(section)
    if not config:
        return {"section": section, "title": section, "content": "", "error": f"Unknown section: {section}"}

    title = SECTION_TITLES.get(section, section)

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=config["query"],
        paper_ids=paper_ids,
        top_k=10,
    )

    if not retrieval.context_text.strip():
        return {
            "section": section,
            "title": title,
            "content": f"*Không đủ dữ liệu từ các tài liệu đã chọn để viết phần này.*",
            "papers_used": [],
            "chunks_used": 0,
            "citations": [],
        }

    paper_list_text = "\n".join([f"- {t}" for t in paper_titles.values()])
    full_prompt = f"{config['prompt']}\n\nCác tài liệu tham khảo:\n{paper_list_text}\n\nĐoạn trích từ tài liệu:\n{retrieval.context_text}"

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=full_prompt,
        context_text=retrieval.context_text,
        task_type="review",
    )

    citations = extract_citations(generation.content, paper_titles)

    # Inject numbered citation markers [1][2] etc based on order of appearance
    content_with_refs = generation.content
    citation_map: dict[str, int] = {}
    ref_counter = 1
    def replace_citation(match):
        nonlocal ref_counter
        title_match = match.group(1).strip()
        key = None
        for pid, ptitle in paper_titles.items():
            if ptitle and (title_match.lower() in ptitle.lower() or ptitle.lower() in title_match.lower()):
                key = title_match
                break
        if key:
            if key not in citation_map:
                citation_map[key] = ref_counter
                ref_counter += 1
            return f"[{citation_map[key]}]"
        return match.group(0)

    content_with_refs = re.sub(r'\[([^\]]+?)\]', replace_citation, content_with_refs)

    return {
        "section": section,
        "title": title,
        "content": content_with_refs,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
        "model_used": generation.model_used,
        "citations": citations,
    }


async def _generate_bibliography(paper_ids: list[str], paper_titles: dict) -> dict:
    """Generate a bibliography section from selected papers."""
    session = get_session(state.engine)
    try:
        papers_db = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        if not papers_db:
            return {
                "section": "bibliography",
                "title": SECTION_TITLES["bibliography"],
                "content": "*Không có dữ liệu thư mục.*",
                "papers_used": [],
                "chunks_used": 0,
                "citations": [],
            }

        entries: list[str] = []
        for paper in papers_db:
            authors_list = _parse_authors(paper.authors)
            if not authors_list:
                authors_list = ["Unknown"]

            title = paper.title or paper.filename.replace(".pdf", "").replace("_", " ")
            year = paper.year or "n.d."
            doi = paper.doi or ""
            pages = paper.page_count

            if len(authors_list) == 0:
                author_str = "Unknown"
            elif len(authors_list) == 1:
                author_str = authors_list[0]
            elif len(authors_list) == 2:
                author_str = f"{authors_list[0]} & {authors_list[1]}"
            elif len(authors_list) <= 20:
                author_str = ", ".join(authors_list[:-1]) + f", & {authors_list[-1]}"
            else:
                author_str = ", ".join(authors_list[:19]) + f", ... {authors_list[-1]}"

            formatted = f"{author_str} ({year}). *{title}*"
            if pages:
                formatted += f" (pp. 1-{pages})"
            formatted += "."
            if doi:
                formatted += f" https://doi.org/{doi}"
            entries.append(f"- {formatted}")

        bibliography = "\n\n".join(entries)
        return {
            "section": "bibliography",
            "title": SECTION_TITLES["bibliography"],
            "content": bibliography,
            "papers_used": list(paper_titles.keys()),
            "chunks_used": 0,
            "model_used": "citation-formatting",
            "citations": [],
        }
    finally:
        session.close()


# ─── Outline Generation ──────────────────────────────────────

@router.post("/outline")
async def generate_outline(body: dict = Body(...)):
    """Generate a dynamic outline based on selected papers' content.
    STORM-inspired: analyze papers, suggest relevant sections.
    """
    paper_ids = body.get("paper_ids", [])
    existing_sections = body.get("existing_sections", None)

    if not paper_ids:
        return {"error": "Vui lòng chọn ít nhất 1 tài liệu.", "sections": []}

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"error": paper_error, "sections": []}

    session = get_session(state.engine)
    try:
        papers_db = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        paper_titles = {p.id: p.title or p.filename for p in papers_db}
        paper_abstracts = {}
        for p in papers_db:
            summary = p.auto_summary or p.abstract or ""
            paper_abstracts[p.id] = summary[:500] if summary else "Không có tóm tắt."
    finally:
        session.close()

    if not paper_titles:
        return {"error": "Không tìm thấy tài liệu nào.", "sections": []}

    paper_info = "\n\n".join([
        f"Paper: {paper_titles[pid]}\nTóm tắt: {paper_abstracts.get(pid, 'N/A')}"
        for pid in paper_ids if pid in paper_titles
    ])

    prompt = f"""Bạn là chuyên gia phân tích tài liệu nghiên cứu. Dựa trên danh sách các paper dưới đây, hãy đề xuất một outline (dàn ý) phù hợp cho một bài Literature Review.

Các paper:
{paper_info}

Yêu cầu:
1. Phân tích chủ đề chung của các paper
2. Đề xuất các section phù hợp với nội dung cụ thể của các paper này
3. Mỗi section cần có: key (id ngắn không dấu), title (tiêu đề hiển thị), description (mô tả ngắn nội dung section)
4. Ưu tiên các section liên quan đến: phương pháp, kết quả, so sánh, hạn chế, khoảng trống nghiên cứu
5. Tối thiểu 4 section, tối đa 8 section (không tính Bibliography)

Trả về JSON array đúng định dạng sau, không kèm văn bản khác:
[
  {{"key": "background", "title": "1. Background", "description": "Tổng quan về lĩnh vực nghiên cứu"}},
  {{"key": "methodology_comparison", "title": "2. Methodology Comparison", "description": "So sánh các phương pháp"}}
]

Dùng tiếng Việt cho description. Key dùng tiếng Anh không dấu, viết thường, underscore."""
    if existing_sections:
        prompt += f"\n\nCác section hiện tại (có thể giữ hoặc đề xuất thay đổi): {json.dumps(existing_sections)}"

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=prompt,
        context_text=paper_info,
        task_type="review",
    )

    content = generation.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    sections = []
    try:
        start = content.find("[")
        end = content.rfind("]")
        if start != -1 and end != -1:
            sections = json.loads(content[start:end+1])
    except Exception as e:
        logger.warning(f"Outline JSON parse failed: {e}")
        sections = []

    if not sections:
        sections = [
            {"key": "background", "title": "1. Background", "description": "Tổng quan về lĩnh vực nghiên cứu"},
            {"key": "related_work", "title": "2. Related Work", "description": "Các công trình liên quan"},
            {"key": "methodology_comparison", "title": "3. Methodology Comparison", "description": "So sánh phương pháp"},
            {"key": "findings", "title": "4. Findings", "description": "Kết quả nghiên cứu chính"},
            {"key": "limitations", "title": "5. Limitations", "description": "Hạn chế của các nghiên cứu"},
            {"key": "research_gaps", "title": "6. Research Gaps", "description": "Khoảng trống nghiên cứu"},
            {"key": "future_directions", "title": "7. Future Directions", "description": "Hướng phát triển tương lai"},
        ]

    return {"sections": sections, "paper_titles": list(paper_titles.values())}


# ─── Evidence Retrieval ──────────────────────────────────────

@router.post("/evidence")
async def get_evidence(body: dict = Body(...)):
    """Get evidence chunks for a specific section query.
    Returns count, papers used, and sample chunks.
    """
    paper_ids = body.get("paper_ids", [])
    section = body.get("section", "")
    top_k = body.get("top_k", 10)

    if not paper_ids or not section:
        return {"error": "Missing paper_ids or section", "evidence": [], "total_chunks": 0, "papers_used": []}

    config = SECTION_CONFIG.get(section)
    if not config:
        return {"error": f"Unknown section: {section}", "evidence": [], "total_chunks": 0, "papers_used": []}

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=config["query"],
        paper_ids=paper_ids,
        top_k=top_k,
    )

    evidence = []
    for chunk in retrieval.chunks:
        evidence.append({
            "chunk_id": chunk["chunk_id"],
            "paper_id": chunk["paper_id"],
            "paper_title": chunk["paper_title"],
            "content": chunk["content"][:300],
            "page_number": chunk.get("page_number"),
            "score": round(chunk["score"], 4),
        })

    return {
        "section": section,
        "total_chunks": retrieval.total_chunks,
        "papers_used": retrieval.papers_used,
        "evidence": evidence,
    }


# ─── Draft Generation ────────────────────────────────────────

@router.post("/draft")
async def generate_draft(body: dict = Body(...)):
    """Generate a full literature review draft (all sections)."""
    paper_ids = body.get("paper_ids", [])

    if not paper_ids:
        return {"error": "Vui lòng chọn ít nhất 1 tài liệu.", "sections": [], "full_text": ""}

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"error": paper_error, "sections": [], "full_text": ""}

    session = get_session(state.engine)
    try:
        papers_db = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        paper_titles = {p.id: p.title or p.filename for p in papers_db}
    finally:
        session.close()

    if not paper_titles:
        return {"error": "Không tìm thấy tài liệu nào.", "sections": [], "full_text": ""}

    title = body.get("title", "Literature Review")
    include_sections = body.get("sections", REVIEW_SECTIONS)

    tasks = []
    for section in include_sections:
        if section in SECTION_CONFIG or section == "bibliography":
            tasks.append(_generate_section(paper_ids, section, paper_titles))

    results = await asyncio.gather(*tasks)

    full_parts = [f"# {title}\n"]
    for res in results:
        full_parts.append(f"\n## {res['title']}\n\n{res['content']}\n")

    full_parts.append(f"\n---\n*Bài Literature Review được tạo tự động bởi ResearchMind AI.*")
    full_text = "\n".join(full_parts)

    return {
        "title": title,
        "paper_titles": list(paper_titles.values()),
        "sections": results,
        "full_text": full_text,
    }


@router.post("/draft/stream")
async def generate_draft_stream(req: Request, body: dict = Body(...)):
    """Stream a literature review draft section-by-section as SSE."""
    paper_ids = body.get("paper_ids", [])
    title = body.get("title", "Literature Review")
    include_sections = body.get("sections", REVIEW_SECTIONS)

    async def event_stream():
        if not paper_ids:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Vui lòng chọn ít nhất 1 tài liệu.'}, ensure_ascii=False)}\n\n"
            return

        paper_error = check_papers_ready(paper_ids)
        if paper_error:
            yield f"data: {json.dumps({'type': 'error', 'error': paper_error}, ensure_ascii=False)}\n\n"
            return

        session = get_session(state.engine)
        try:
            papers_db = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
            paper_titles = {p.id: p.title or p.filename for p in papers_db}
        finally:
            session.close()

        if not paper_titles:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Không tìm thấy tài liệu nào.'}, ensure_ascii=False)}\n\n"
            return

        valid_sections = [
            section for section in include_sections
            if section in SECTION_CONFIG or section == "bibliography"
        ]
        yield f"data: {json.dumps({'type': 'start', 'title': title, 'paper_titles': list(paper_titles.values()), 'sections': valid_sections}, ensure_ascii=False)}\n\n"

        started_at = datetime.utcnow()
        async def run_section(section: str):
            try:
                return section, await _generate_section(paper_ids, section, paper_titles)
            except Exception as e:
                logger.exception(f"Review section generation failed for {section}: {e}")
                return section, {
                    "section": section,
                    "title": SECTION_TITLES.get(section, section),
                    "content": "",
                    "papers_used": [],
                    "chunks_used": 0,
                    "citations": [],
                    "error": str(e),
                }

        tasks = [asyncio.create_task(run_section(section)) for section in valid_sections]
        completed: list[dict] = []

        for task in asyncio.as_completed(tasks):
            if await req.is_disconnected():
                logger.info("REVIEW_STREAM client disconnected, cancelling pending tasks")
                for t in tasks:
                    t.cancel()
                break
            section, result = await task
            completed.append(result)
            yield f"data: {json.dumps({'type': 'section', 'section': result}, ensure_ascii=False)}\n\n"

        ordered = {res["section"]: res for res in completed}
        full_parts = [f"# {title}\n"]
        for section in valid_sections:
            res = ordered.get(section)
            if res:
                full_parts.append(f"\n## {res['title']}\n\n{res['content']}\n")
        full_parts.append("\n---\n*Bài Literature Review được tạo tự động bởi ResearchMind AI.*")
        full_text = "\n".join(full_parts)

        logger.info(
            "REVIEW_STREAM_TIMING "
            f"sections={len(completed)} total={(datetime.utcnow() - started_at).total_seconds():.2f}s"
        )
        yield f"data: {json.dumps({'type': 'done', 'full_text': full_text}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/section")
async def generate_section(body: dict = Body(...)):
    """Generate or regenerate a single section."""
    paper_ids = body.get("paper_ids", [])
    section = body.get("section", "")

    if not paper_ids:
        return {"error": "Vui lòng chọn ít nhất 1 tài liệu.", "content": ""}

    if section not in SECTION_CONFIG and section != "bibliography":
        return {"error": f"Section '{section}' không hợp lệ.", "content": ""}

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"error": paper_error, "content": ""}

    session = get_session(state.engine)
    try:
        papers_db = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        paper_titles = {p.id: p.title or p.filename for p in papers_db}
    finally:
        session.close()

    result = await _generate_section(paper_ids, section, paper_titles)
    return result


# ─── Comparison Matrix ───────────────────────────────────────

@router.post("/matrix")
async def generate_matrix(body: dict = Body(...)):
    """Generate a comparison matrix for selected papers."""
    paper_ids = body.get("paper_ids", [])

    if not paper_ids or len(paper_ids) < 2:
        return {
            "error": "Vui lòng chọn ít nhất 2 tài liệu để so sánh.",
            "matrix": {"columns": [], "rows": []},
            "markdown": "",
        }

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"error": paper_error, "matrix": {"columns": [], "rows": []}, "markdown": ""}

    session = get_session(state.engine)
    try:
        papers_db = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        paper_titles = {p.id: p.title or p.filename for p in papers_db}
    finally:
        session.close()

    async def extract_paper(paper_id: str, title: str):
        retrieval = await asyncio.to_thread(
            state.retriever.retrieve,
            query="abstract introduction methodology experimental results dataset conclusion limitations",
            paper_ids=[paper_id],
            top_k=8,
        )
        if not retrieval.context_text.strip():
            return {"id": paper_id, "title": title, "data": {
                "objective": "Không có dữ liệu.",
                "methodology": "Không có dữ liệu.",
                "dataset": "Không có dữ liệu.",
                "findings": "Không có dữ liệu.",
                "limitations": "Không có dữ liệu.",
            }}

        prompt = f"""Bạn là chuyên gia nghiên cứu khoa học. Đọc đoạn trích từ bài nghiên cứu "{title}" và trích xuất thông tin dưới dạng JSON. Mỗi phần từ 1-2 câu, viết bằng tiếng Việt.

Trả về đúng JSON sau, không kèm văn bản khác:
{{
  "objective": "Mục tiêu nghiên cứu",
  "methodology": "Phương pháp",
  "dataset": "Dữ liệu",
  "findings": "Kết quả",
  "limitations": "Hạn chế"
}}

Đoạn trích:\n{retrieval.context_text}"""

        generation = await asyncio.to_thread(state.generator.generate, query=prompt, context_text=retrieval.context_text, task_type="review")
        content = generation.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        data = {}
        try:
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1:
                data = json.loads(content[start:end+1])
        except Exception as e:
            logger.warning(f"Matrix JSON parse failed for {title}: {e}")
        for key in ["objective", "methodology", "dataset", "findings", "limitations"]:
            if key not in data or not str(data.get(key, "")).strip():
                data[key] = "Không thể trích xuất."
        return {"id": paper_id, "title": title, "data": data}

    tasks = [extract_paper(pid, paper_titles.get(pid, f"Paper {pid[:6]}")) for pid in paper_ids]
    results = await asyncio.gather(*tasks)

    columns = ["Tiêu chí"] + [r["title"] for r in results]
    rows = [
        ["🎯 Mục tiêu"] + [r["data"]["objective"] for r in results],
        ["⚙️ Phương pháp"] + [r["data"]["methodology"] for r in results],
        ["📊 Dữ liệu"] + [r["data"]["dataset"] for r in results],
        ["🔬 Kết quả"] + [r["data"]["findings"] for r in results],
        ["⚠️ Hạn chế"] + [r["data"]["limitations"] for r in results],
    ]

    md = "## 📊 Ma trận so sánh tài liệu\n\n| " + " | ".join(columns) + " |\n"
    md += "| " + " | ".join(["---"] * len(columns)) + " |\n"
    for r in rows:
        cells = [c.replace("\n", " ") for c in r]
        md += "| " + " | ".join(cells) + " |\n"

    return {"matrix": {"columns": columns, "rows": rows}, "markdown": md}


# ─── Quality Checks ──────────────────────────────────────────
# Two-stage pipeline:
#   1. Rule-based (deterministic, no LLM)
#   2. LLM-based (semantic understanding)

QUALITY_CHECK_SECTIONS = ["background", "related_work", "methodology_comparison", "findings", "limitations", "research_gaps", "future_directions"]

# Citation patterns to detect: numbered [1], [1][2], parenthetical (Author, 2023), DOI, [Paper Name]
CITATION_RE = re.compile(
    r'\[\d+\](?:\[\d+\])*'                 # [1] or [1][2]
    r'|\([^)]*\d{4}[^)]*\)'               # (Author, 2023)
    r'|https?://doi\.org/\S+'              # DOI URL
    r'|\[[\w\sÀ-ỹ\-]+\]'                    # [Tên Paper]
)
MIN_WORDS_PER_SECTION = 50
MAX_WORDS_PER_SECTION = 800

# Actions available per issue type
ISSUE_ACTIONS = {
    "missing_citation": {"action": "add_citation", "label": "Thêm citation", "section_target": True},
    "unsourced_claim": {"action": "add_citation", "label": "Thêm citation", "section_target": True},
    "repetition": {"action": "trim_content", "label": "Rút gọn", "section_target": True},
    "contradiction": {"action": "review_conflict", "label": "Xem mâu thuẫn", "section_target": False},
    "length_too_short": {"action": "expand_content", "label": "Mở rộng", "section_target": True},
    "length_too_long": {"action": "trim_content", "label": "Rút gọn", "section_target": True},
}


def _rule_based_checks(sections: dict[str, dict]) -> list[dict]:
    """Run rule-based quality checks (deterministic, no LLM)."""
    issues = []

    word_counts: dict[str, int] = {}
    for sec_key in QUALITY_CHECK_SECTIONS:
        data = sections.get(sec_key)
        if not data or not data.get("content", "").strip():
            continue
        content = data["content"]
        words = len(content.split())
        word_counts[sec_key] = words

        # Check: missing_citation — section has content but no citation pattern
        if not CITATION_RE.search(content):
            action = ISSUE_ACTIONS["missing_citation"]
            issues.append({
                "severity": "high",
                "section": sec_key,
                "type": "missing_citation",
                "message": f"Section này không có trích dẫn nào.",
                "action": action["action"],
                "action_label": action["label"],
            })

    # Check: length_issue (relative to other sections)
    if word_counts:
        valid_counts = [wc for wc in word_counts.values() if wc > 0]
        if valid_counts:
            avg_words = sum(valid_counts) / len(valid_counts)
            for sec_key, wc in word_counts.items():
                if wc < MIN_WORDS_PER_SECTION:
                    action = ISSUE_ACTIONS["length_too_short"]
                    issues.append({
                        "severity": "medium",
                        "section": sec_key,
                        "type": "length_too_short",
                        "message": f"Section quá ngắn ({wc} từ — trung bình {int(avg_words)} từ).",
                        "action": action["action"],
                        "action_label": action["label"],
                    })
                elif wc > MAX_WORDS_PER_SECTION and wc > avg_words * 1.5:
                    action = ISSUE_ACTIONS["length_too_long"]
                    issues.append({
                        "severity": "medium",
                        "section": sec_key,
                        "type": "length_too_long",
                        "message": f"Section quá dài ({wc} từ — trung bình {int(avg_words)} từ).",
                        "action": action["action"],
                        "action_label": action["label"],
                    })

    return issues


def _build_llm_input(sections: dict[str, dict], title: str, rule_issues: list[dict]) -> tuple[str, list[dict]]:
    """Build input text for LLM-based checks (only sections that pass rules)."""
    sections_text = ""
    section_list = []
    for sec_key in QUALITY_CHECK_SECTIONS:
        data = sections.get(sec_key)
        if not data or not data.get("content", "").strip():
            continue
        sec_title = SECTION_TITLES.get(sec_key, sec_key)
        content = data["content"]
        citations = data.get("citations", [])
        # Include section in LLM check if it has content
        sections_text += f"\n--- Section ID: {sec_key} | Title: {sec_title} ---\n"
        sections_text += f"Trích dẫn gốc: {', '.join(c.get('paper_title', '') for c in citations) if citations else 'None'}\n"
        sections_text += f"Nội dung: {content[:2000]}\n"
        section_list.append(sec_key)

    return sections_text, section_list


def _parse_llm_issues(content: str, section_list: list[str]) -> list[dict]:
    """Parse LLM JSON output into structured issues."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    parsed = []
    try:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end != -1:
            parsed = json.loads(cleaned[start:end+1])
    except Exception:
        return []

    issues = []
    for iss in parsed:
        sec = iss.get("section", "")
        if sec not in section_list:
            continue
        if not iss.get("message"):
            continue
        itype = iss.get("type", "unsourced_claim")
        action_key = itype if itype in ISSUE_ACTIONS else "unsourced_claim"
        action = ISSUE_ACTIONS[action_key]
        issues.append({
            "severity": iss.get("severity", "low"),
            "section": sec,
            "type": itype,
            "message": iss.get("message"),
            "action": action["action"],
            "action_label": action["label"],
        })
    return issues


@router.post("/check-quality")
async def check_quality(body: dict = Body(...)):
    """Check quality of a review draft.

    Two-stage pipeline:
    1. Rule-based: citation detection, length heuristics (no LLM cost)
    2. LLM-based: repetition, contradiction, unsourced claims
    """
    title = body.get("title", "Literature Review")
    sections = body.get("sections", {})

    if not sections:
        return {"issues": []}

    all_issues = []

    # Stage 1: Rule-based checks
    rule_issues = _rule_based_checks(sections)
    all_issues.extend(rule_issues)

    # Sections that already have missing_citation flagged by rules
    sections_with_citation_issues = {i["section"] for i in all_issues if i["type"] == "missing_citation"}

    # Stage 2: LLM-based checks (repetition, contradiction, unsourced claims)
    sections_text, section_list = _build_llm_input(sections, title, rule_issues)
    if sections_text.strip() and section_list:
        # Tell LLM which sections already have rule issues to avoid duplicates
        skip_note = ""
        if sections_with_citation_issues:
            skip_note = f"\nCác section sau đã được phát hiện thiếu citation bởi rule, KHÔNG cần kiểm tra lại: {', '.join(sorted(sections_with_citation_issues))}"

        prompt = f"""Bạn là chuyên gia đánh giá chất lượng Literature Review. Phân tích bài viết dưới đây.

Tiêu đề: {title}
{skip_note}
{sections_text}

Yêu cầu: Chỉ kiểm tra các vấn đề SAU (bỏ qua thiếu citation và độ dài — đã được kiểm tra tự động):
1. **unsourced_claim** — Có khẳng định/nhận định không có nguồn dẫn chứng cụ thể
2. **repetition** — Cùng một ý/ luận điểm xuất hiện ở nhiều section khác nhau
3. **contradiction** — Hai section nói ngược nhau về cùng một vấn đề

Trả về JSON array, mỗi issue định dạng:
{{"severity": "high"|"medium"|"low", "section": "{section_key}", "type": "unsourced_claim"|"repetition"|"contradiction", "message": "Mô tả vấn đề cụ thể bằng tiếng Việt"}}

Chỉ trả về JSON array hợp lệ, không kèm văn bản khác."""

        try:
            generation = await asyncio.to_thread(
                state.generator.generate,
                query=prompt,
                context_text=sections_text,
                task_type="quality_check",
            )
            llm_issues = _parse_llm_issues(generation.content, section_list)
            all_issues.extend(llm_issues)
        except Exception as e:
            logger.exception(f"LLM quality check failed: {e}")

    if not all_issues:
        return {"issues": []}

    return {"issues": all_issues}


# ─── Save / Load Drafts ─────────────────────────────────────

@router.post("/save")
async def save_draft(body: dict = Body(...)):
    """Save or update a review draft. If id is provided, update existing draft."""
    draft_id = body.get("id")
    title = body.get("title", "Literature Review")
    paper_ids = body.get("paper_ids", [])
    paper_titles = body.get("paper_titles", [])
    outline_sections = body.get("outline_sections", [])
    sections = body.get("sections", {})
    full_text = body.get("full_text", "")
    create_version = body.get("create_version", False)  # manual save → True, auto-save → False

    MAX_VERSIONS = 3
    session = get_session(state.engine)
    try:
        if draft_id:
            existing = session.query(ReviewDraft).filter(ReviewDraft.id == draft_id).first()
            if existing:
                # Try to read versions column (may not exist in old DB)
                try:
                    raw_versions = existing.versions or "[]"
                except Exception:
                    raw_versions = "[]"

                versions = json.loads(raw_versions)

                # Only create version point on manual save (not on every debounce)
                if create_version:
                    saved_at = None
                    try:
                        saved_at = existing.updated_at.isoformat() if existing.updated_at else None
                    except Exception:
                        pass
                    versions.append({
                        "title": existing.title,
                        "paper_ids": json.loads(existing.paper_ids or "[]"),
                        "paper_titles": json.loads(existing.paper_titles or "[]"),
                        "outline_sections": json.loads(existing.outline_sections or "[]"),
                        "sections": json.loads(existing.sections or "{}"),
                        "full_text": existing.full_text or "",
                        "saved_at": saved_at,
                    })
                    if len(versions) > MAX_VERSIONS:
                        versions = versions[-MAX_VERSIONS:]

                existing.title = title
                existing.paper_ids = json.dumps(paper_ids, ensure_ascii=False)
                existing.paper_titles = json.dumps(paper_titles, ensure_ascii=False)
                existing.outline_sections = json.dumps(outline_sections, ensure_ascii=False)
                existing.sections = json.dumps(sections, ensure_ascii=False)
                existing.full_text = full_text

                # Only set versions column if it exists in the table
                try:
                    existing.versions = json.dumps(versions, ensure_ascii=False)
                except Exception:
                    pass

                session.commit()
                return {"id": draft_id, "status": "updated", "versions_count": len(versions)}
            else:
                draft_id = None

        if not draft_id:
            new_draft = ReviewDraft(
                title=title,
                paper_ids=json.dumps(paper_ids, ensure_ascii=False),
                paper_titles=json.dumps(paper_titles, ensure_ascii=False),
                outline_sections=json.dumps(outline_sections, ensure_ascii=False),
                sections=json.dumps(sections, ensure_ascii=False),
                full_text=full_text,
            )
            session.add(new_draft)
            session.commit()
            return {"id": new_draft.id, "status": "created", "versions_count": 0}
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save review draft: {e}")
        return {"error": f"Không thể lưu draft: {str(e)}"}
    finally:
        session.close()


@router.get("/drafts")
async def list_drafts():
    """List all saved review drafts."""
    session = get_session(state.engine)
    try:
        drafts = session.query(ReviewDraft).order_by(ReviewDraft.updated_at.desc()).all()
        result = []
        for d in drafts:
            result.append({
                "id": d.id,
                "title": d.title,
                "paper_count": len(json.loads(d.paper_ids or "[]")),
                "section_count": len(json.loads(d.outline_sections or "[]")),
                "updated_at": d.updated_at.isoformat() if d.updated_at else None,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            })
        return {"drafts": result}
    except Exception as e:
        logger.error(f"Failed to list review drafts: {e}")
        return {"drafts": []}
    finally:
        session.close()


@router.get("/draft/{draft_id}")
async def load_draft(draft_id: str):
    """Load a saved review draft by ID."""
    session = get_session(state.engine)
    try:
        draft = session.query(ReviewDraft).filter(ReviewDraft.id == draft_id).first()
        if not draft:
            return {"error": "Draft không tồn tại."}

        return {
            "id": draft.id,
            "title": draft.title,
            "paper_ids": json.loads(draft.paper_ids or "[]"),
            "paper_titles": json.loads(draft.paper_titles or "[]"),
            "outline_sections": json.loads(draft.outline_sections or "[]"),
            "sections": json.loads(draft.sections or "{}"),
            "full_text": draft.full_text or "",
            "created_at": draft.created_at.isoformat() if draft.created_at else None,
            "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
        }
    except Exception as e:
        logger.error(f"Failed to load review draft: {e}")
        return {"error": f"Không thể tải draft: {str(e)}"}
    finally:
        session.close()


@router.delete("/draft/{draft_id}")
async def delete_draft(draft_id: str):
    """Delete a saved review draft."""
    session = get_session(state.engine)
    try:
        draft = session.query(ReviewDraft).filter(ReviewDraft.id == draft_id).first()
        if not draft:
            return {"error": "Draft không tồn tại."}
        session.delete(draft)
        session.commit()
        return {"status": "deleted", "id": draft_id}
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to delete review draft: {e}")
        return {"error": f"Không thể xoá draft: {str(e)}"}
    finally:
        session.close()


# ─── Version History ─────────────────────────────────────────

@router.get("/draft/{draft_id}/versions")
async def list_draft_versions(draft_id: str):
    """List all saved versions for a draft."""
    session = get_session(state.engine)
    try:
        draft = session.query(ReviewDraft).filter(ReviewDraft.id == draft_id).first()
        if not draft:
            return {"error": "Draft không tồn tại."}

        versions = json.loads(draft.versions or "[]")
        result = []
        for i, v in enumerate(versions):
            result.append({
                "index": i,
                "saved_at": v.get("saved_at"),
                "title": v.get("title", draft.title),
                "section_count": len(v.get("outline_sections", [])),
                "paper_count": len(v.get("paper_ids", [])),
            })
        return {"versions": result}
    except Exception as e:
        logger.error(f"Failed to list draft versions: {e}")
        return {"versions": []}
    finally:
        session.close()


@router.get("/draft/{draft_id}/versions/{version_idx}")
async def load_draft_version(draft_id: str, version_idx: int):
    """Load a specific version of a draft."""
    session = get_session(state.engine)
    try:
        draft = session.query(ReviewDraft).filter(ReviewDraft.id == draft_id).first()
        if not draft:
            return {"error": "Draft không tồn tại."}

        versions = json.loads(draft.versions or "[]")
        if version_idx < 0 or version_idx >= len(versions):
            return {"error": f"Version {version_idx} không tồn tại."}

        v = versions[version_idx]
        return {
            "title": v.get("title", draft.title),
            "paper_ids": v.get("paper_ids", []),
            "paper_titles": v.get("paper_titles", []),
            "outline_sections": v.get("outline_sections", []),
            "sections": v.get("sections", {}),
            "full_text": v.get("full_text", ""),
            "saved_at": v.get("saved_at"),
        }
    except Exception as e:
        logger.error(f"Failed to load draft version: {e}")
        return {"error": f"Không thể tải version: {str(e)}"}
    finally:
        session.close()


@router.post("/draft/{draft_id}/versions/{version_idx}/restore")
async def restore_draft_version(draft_id: str, version_idx: int):
    """Restore a draft to a previous version."""
    session = get_session(state.engine)
    try:
        draft = session.query(ReviewDraft).filter(ReviewDraft.id == draft_id).first()
        if not draft:
            return {"error": "Draft không tồn tại."}

        versions = json.loads(draft.versions or "[]")
        if version_idx < 0 or version_idx >= len(versions):
            return {"error": f"Version {version_idx} không tồn tại."}

        v = versions[version_idx]

        # Save current state as a version before restoring
        current_version = {
            "title": draft.title,
            "paper_ids": json.loads(draft.paper_ids or "[]"),
            "paper_titles": json.loads(draft.paper_titles or "[]"),
            "outline_sections": json.loads(draft.outline_sections or "[]"),
            "sections": json.loads(draft.sections or "{}"),
            "full_text": draft.full_text or "",
            "saved_at": draft.updated_at.isoformat() if draft.updated_at else None,
        }
        versions.append(current_version)
        if len(versions) > 3:
            versions = versions[-3:]

        draft.title = v.get("title", draft.title)
        draft.paper_ids = json.dumps(v.get("paper_ids", []), ensure_ascii=False)
        draft.paper_titles = json.dumps(v.get("paper_titles", []), ensure_ascii=False)
        draft.outline_sections = json.dumps(v.get("outline_sections", []), ensure_ascii=False)
        draft.sections = json.dumps(v.get("sections", {}), ensure_ascii=False)
        draft.full_text = v.get("full_text", "")
        draft.versions = json.dumps(versions, ensure_ascii=False)
        session.commit()
        return {"status": "restored", "id": draft_id}
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to restore draft version: {e}")
        return {"error": f"Không thể khôi phục version: {str(e)}"}
    finally:
        session.close()


# ─── Export ──────────────────────────────────────────────────

@router.post("/export")
async def export_review(body: dict = Body(...)):
    """Export the full review as DOCX/HTML/Markdown. Uses existing synthesis export."""
    title = body.get("title", "Literature Review")
    content = body.get("content", "")
    fmt = body.get("format", "markdown")

    if not content.strip():
        return {"error": "Nội dung review trống, không thể xuất."}

    import io
    import re
    from fastapi.responses import StreamingResponse

    safe_title = re.sub(r"[^\w\-]", "_", title)

    if fmt == "markdown" or fmt == "md":
        buf = io.BytesIO(content.encode("utf-8"))
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_title}.md"',
            },
        )

    from export import _add_formatted_text, _md_to_html, _parse_md_events

    if fmt == "docx":
        try:
            from docx import Document
            from docx.shared import Cm, Pt, RGBColor
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.oxml import OxmlElement
            from docx.oxml.ns import qn
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="python-docx chưa được cài đặt. Chạy lệnh: pip install python-docx",
            )

        doc = Document()
        style = doc.styles["Normal"]
        font = style.font
        font.name = "Times New Roman"
        font.size = Pt(12)
        style.paragraph_format.line_spacing = 1.5
        style.paragraph_format.space_after = Pt(6)

        title_para = doc.add_heading(title, level=1)
        title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph()

        def _docx_code_block(code_lines: list[str], lang: str):
            if lang:
                lp = doc.add_paragraph()
                lr = lp.add_run(lang)
                lr.font.size = Pt(8)
                lr.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
                lr.italic = True
                lp.paragraph_format.space_after = Pt(2)
                lp.paragraph_format.space_before = Pt(4)
            for cl in code_lines:
                cp = doc.add_paragraph()
                cr = cp.add_run(cl.replace("\t", "    ") if cl else " ")
                cr.font.name = "Consolas"
                cr.font.size = Pt(8.5)
                cp.paragraph_format.space_after = Pt(0)
                cp.paragraph_format.space_before = Pt(0)
                cp.paragraph_format.line_spacing = 1.15
                shd = OxmlElement("w:shd")
                shd.set(qn("w:fill"), "f1f5f9")
                shd.set(qn("w:val"), "clear")
                cp.paragraph_format.element.get_or_add_pPr().append(shd)

        def _docx_table(rows: list[list[str]]):
            if len(rows) < 2:
                return
            header_row = rows[0]
            data_rows = rows[2:] if len(rows) > 2 else []
            if not header_row:
                return
            table = doc.add_table(rows=1 + len(data_rows), cols=len(header_row))
            table.style = "Table Grid"
            for ci, hcell in enumerate(header_row):
                cell = table.rows[0].cells[ci]
                cell.text = hcell.strip()
                for para in cell.paragraphs:
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for run in para.runs:
                        run.bold = True
                        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                        run.font.size = Pt(10)
                shd = OxmlElement("w:shd")
                shd.set(qn("w:fill"), "6366f1")
                shd.set(qn("w:val"), "clear")
                cell._tc.get_or_add_tcPr().append(shd)
            alt = ["f8fafc", "ffffff"]
            for ri, row in enumerate(data_rows):
                for ci, dcell in enumerate(row):
                    cell = table.rows[ri + 1].cells[ci]
                    cell.text = dcell.strip()
                    for para in cell.paragraphs:
                        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        for run in para.runs:
                            run.font.size = Pt(10)
                    shd = OxmlElement("w:shd")
                    shd.set(qn("w:fill"), alt[ri % 2])
                    shd.set(qn("w:val"), "clear")
                    cell._tc.get_or_add_tcPr().append(shd)
            doc.add_paragraph()

        for event, data in _parse_md_events(content):
            if event == "code_block":
                _docx_code_block(data[0], data[1])
            elif event == "table":
                _docx_table(data[0])
            elif event == "heading1":
                doc.add_heading(data[0], level=1)
            elif event == "heading2":
                doc.add_heading(data[0], level=2)
            elif event == "heading3":
                doc.add_heading(data[0], level=3)
            elif event == "hr":
                p = doc.add_paragraph()
                pPr = p.paragraph_format.element.get_or_add_pPr()
                pBdr = OxmlElement("w:pBdr")
                bottom = OxmlElement("w:bottom")
                bottom.set(qn("w:val"), "single")
                bottom.set(qn("w:sz"), "6")
                bottom.set(qn("w:space"), "4")
                bottom.set(qn("w:color"), "cbd5e1")
                pBdr.append(bottom)
                pPr.append(pBdr)
            elif event == "bullet_list":
                for item in data[0]:
                    p = doc.add_paragraph(style="List Bullet")
                    _add_formatted_text(p, item)
            elif event == "numbered_list":
                for item in data[0]:
                    p = doc.add_paragraph(style="List Number")
                    _add_formatted_text(p, item)
            elif event == "blockquote":
                for line in data[0]:
                    p = doc.add_paragraph(style="Quote")
                    _add_formatted_text(p, line)
            elif event == "paragraph":
                for line in data[0]:
                    p = doc.add_paragraph()
                    _add_formatted_text(p, line)

        doc.add_paragraph()
        footer_para = doc.add_paragraph()
        footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer_run = footer_para.add_run(
            f"Exported from ResearchMind VN on {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        )
        footer_run.font.size = Pt(9)
        footer_run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)

        for section in doc.sections:
            section.top_margin = Cm(2.54)
            section.bottom_margin = Cm(2.54)
            section.left_margin = Cm(2.54)
            section.right_margin = Cm(2.54)

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_title}.docx"',
            },
        )

    html_body = _md_to_html(content)
    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; background: #f8fafc; }}
        h1 {{ color: #0f172a; border-bottom: 2px solid #8b5cf6; padding-bottom: 12px; }}
        h2 {{ color: #1e293b; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }}
        h3 {{ color: #334155; }}
        p {{ margin-bottom: 1.25em; }}
        table {{ width: 100%; border-collapse: collapse; margin: 1em 0; }}
        th {{ background: #6366f1; color: #fff; padding: 10px 12px; }}
        td {{ padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }}
        code {{ background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }}
        pre {{ border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; overflow-x: auto; }}
        blockquote {{ border-left: 4px solid #8b5cf6; background: #f8fafc; margin: 1em 0; padding: 12px 20px; }}
    </style>
</head>
<body>
    {html_body}
</body>
</html>"""
    buf_html = io.BytesIO(html_content.encode("utf-8"))
    buf_html.seek(0)
    return StreamingResponse(
        buf_html,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.html"'},
    )
