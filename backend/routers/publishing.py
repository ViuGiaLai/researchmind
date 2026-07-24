"""
ResearchMind VN — Publishing Engine & Academic Exporter Router.

Endpoints:
- GET  /api/publishing/templates        → List supported venue publishing templates
- POST /api/publishing/audit            → Audit manuscript against journal/conference rules
- POST /api/publishing/sync-guidelines  → Dynamically sync & verify venue guidelines against live official sources
- POST /api/publishing/export/latex      → Export manuscript to LaTeX ZIP package
- POST /api/publishing/export/bibtex     → Export citations to BibTeX
- POST /api/publishing/export/report     → Export HTML Audit Report (printable as PDF)
"""

import json

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import HTMLResponse, Response

try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger("publishing_router")

from db.database import get_session
from db.models import Chunk, Paper
from publishing.auditor import audit_manuscript
from publishing.guideline_fetcher import sync_venue_guideline
from publishing.latex_exporter import build_bibtex_entry, export_paper_to_latex_zip
from publishing.templates import PUBLISHING_TEMPLATES

router = APIRouter(prefix="/api/publishing", tags=["publishing"])


@router.get("/templates")
async def get_templates():
    """List all supported journal & conference publishing templates."""
    return list(PUBLISHING_TEMPLATES.values())


@router.api_route("/sync-guidelines", methods=["GET", "POST"])
async def sync_guidelines_endpoint(venue_id: str = "cvpr", body: dict = Body(None)):
    """Dynamically fetch & verify live venue guidelines against official sources."""
    vid = (body.get("venue_id") if body else None) or venue_id
    return sync_venue_guideline(vid)


@router.post("/audit")
async def audit_paper_endpoint(request: Request, body: dict = Body(...)):
    """Audit paper content or paper ID against template rules."""
    paper_id = body.get("paper_id")
    template_id = body.get("template_id", "ieee_trans")
    title = body.get("title", "")
    content = body.get("content", "")
    author_name = body.get("author_name", "")

    if paper_id:
        session = get_session(request.app.state.engine)
        try:
            p = session.query(Paper).filter(Paper.id == paper_id).first()
            if p:
                title = title or p.title or p.filename
                chunks = session.query(Chunk).filter(Chunk.paper_id == paper_id).order_by(Chunk.chunk_index.asc()).all()
                content = content or "\n\n".join(c.content for c in chunks)
        finally:
            session.close()

    if not content:
        raise HTTPException(status_code=400, detail="No paper content provided for auditing.")

    return audit_manuscript(title=title, text_content=content, template_id=template_id, author_name=author_name)


@router.post("/export/latex")
async def export_latex_endpoint(request: Request, body: dict = Body(...)):
    """Export paper data to a LaTeX ZIP package."""
    paper_id = body.get("paper_id")
    template_id = body.get("template_id", "ieee_trans")

    paper_data = {
        "id": paper_id or "manuscript_1",
        "title": body.get("title", "Manuscript Title"),
        "authors": body.get("authors", ["Author One"]),
        "year": body.get("year", "2026"),
        "doi": body.get("doi", ""),
        "abstract": body.get("abstract", ""),
        "content": body.get("content", ""),
    }

    if paper_id:
        session = get_session(request.app.state.engine)
        try:
            p = session.query(Paper).filter(Paper.id == paper_id).first()
            if p:
                paper_data["title"] = p.title or p.filename
                try:
                    paper_data["authors"] = json.loads(p.authors) if p.authors else []
                except Exception:
                    paper_data["authors"] = [p.authors] if p.authors else []
                paper_data["year"] = str(p.year) if p.year else "2026"
                paper_data["doi"] = p.doi or ""
                paper_data["abstract"] = p.abstract or ""
                chunks = session.query(Chunk).filter(Chunk.paper_id == paper_id).order_by(Chunk.chunk_index.asc()).all()
                paper_data["content"] = "\n\n".join(c.content for c in chunks)
        finally:
            session.close()

    zip_bytes = export_paper_to_latex_zip(paper_data, template_id=template_id)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={template_id}_manuscript.zip"},
    )


@router.post("/export/bibtex")
async def export_bibtex_endpoint(body: dict = Body(...)):
    """Export citations to BibTeX text format."""
    title = body.get("title", "Untitled")
    authors = body.get("authors", [])
    year = body.get("year", "2026")
    doi = body.get("doi", "")
    venue = body.get("venue", "")

    bib_text = build_bibtex_entry("paper1", title, authors, year, venue=venue, doi=doi)
    return Response(
        content=bib_text,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=references.bib"},
    )


@router.post("/export/report")
async def export_audit_report_endpoint(body: dict = Body(...)):
    """Export HTML Audit Report for printing to PDF or saving."""
    title = body.get("title", "Manuscript Title")
    audit_data = body.get("audit_result", {})
    tmpl = audit_data.get("template", {})

    checks_html = []
    for c in audit_data.get("checks", []):
        sev = c.get("severity", "pass")
        badge = "❌ CRITICAL" if sev == "critical" else ("⚠️ WARNING" if sev == "warning" else ("ℹ️ SUGGESTION" if sev == "suggestion" else "✅ PASS"))
        checks_html.append(f"""
        <div style="margin-bottom:12px; padding:12px; border-left:4px solid {'#ef4444' if sev=='critical' else ('#f59e0b' if sev=='warning' else '#22c55e')}; background:#f9fafb;">
            <div style="font-weight:bold; font-size:14px;">{badge} - {c.get('name')} <span style="font-weight:normal; color:#6b7280;">[{c.get('category')} | {c.get('location')}]</span></div>
            <div style="font-size:13px; color:#374151; margin-top:4px;">{c.get('message')}</div>
            {f'<div style="font-size:12px; color:#6b7280; margin-top:4px; font-style:italic;"><strong>Why?</strong> {c.get("why")}</div>' if c.get("why") else ''}
            {f'<div style="font-size:11px; color:#9ca3af; margin-top:2px;">📜 Provenance: {c.get("provenance")}</div>' if c.get("provenance") else ''}
        </div>
        """)

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Publishing Audit Report — {title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #111827; max-width: 850px; margin: 0 auto; }}
        h1 {{ font-size: 24px; font-weight: 800; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }}
        .meta-box {{ display: flex; gap: 20px; background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 24px; }}
        .score {{ font-size: 32px; font-weight: 900; color: #10b981; }}
    </style>
</head>
<body>
    <h1>📋 Journal Compliance Audit Report</h1>
    <div class="meta-box">
        <div>
            <div className="score">{audit_data.get('overall_score', 90)}/100</div>
            <div style="font-size:12px; font-weight:bold; text-transform:uppercase; color:#6b7280;">Overall Score</div>
        </div>
        <div>
            <strong style="font-size:16px;">{tmpl.get('name', 'IEEEtran')}</strong>
            <div style="font-size:13px; color:#4b5563;">Publisher: {tmpl.get('publisher')}</div>
            <div style="font-size:13px; color:#4b5563;">Manuscript: {title}</div>
            <div style="font-size:12px; color:#6b7280; margin-top:4px;">📜 Guideline Provenance: {tmpl.get('provenance', 'Official Guidelines')}</div>
        </div>
    </div>
    <h2>Detailed Audit Checklist ({len(audit_data.get('checks', []))} checks)</h2>
    {''.join(checks_html)}
    <footer style="margin-top: 40px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px;">
        Generated by ResearchMind VN Publishing Engine
    </footer>
</body>
</html>"""

    return HTMLResponse(content=html)
