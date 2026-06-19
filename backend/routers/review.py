"""
ResearchMind VN — Literature Review Builder.

POST /api/review/builder/draft    → Generate full review draft (all sections)
POST /api/review/builder/section  → Generate/regenerate a single section
POST /api/review/builder/matrix   → Generate comparison matrix
POST /api/review/builder/export   → Export full review as DOCX/HTML/Markdown
"""
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, Body, HTTPException
from loguru import logger

from app_state import state
from academic.paper_check import check_papers_ready
from db.database import get_session
from db.models import Paper

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
        }

    paper_list_text = "\n".join([f"- {t}" for t in paper_titles.values()])
    full_prompt = f"{config['prompt']}\n\nCác tài liệu tham khảo:\n{paper_list_text}\n\nĐoạn trích từ tài liệu:\n{retrieval.context_text}"

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=full_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "section": section,
        "title": title,
        "content": generation.content,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
        "model_used": generation.model_used,
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
            }

        entries: list[str] = []
        for paper in papers_db:
            try:
                authors_list = json.loads(paper.authors) if paper.authors else []
            except (json.JSONDecodeError, TypeError):
                authors_list = [a.strip() for a in paper.authors.split(",")] if paper.authors else ["Unknown"]

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
        }
    finally:
        session.close()


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

        generation = await asyncio.to_thread(state.generator.generate, query=prompt, context_text=retrieval.context_text)
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
