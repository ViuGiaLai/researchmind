import asyncio
import json
import re
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Body, File, HTTPException, Query, UploadFile
from loguru import logger

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import Paper, Chunk, Setting
from ingestion.parser import extract_document, SUPPORTED_EXTENSIONS
from ingestion.chunker import chunk_text

router = APIRouter(prefix="/api/papers", tags=["Papers"])


# ─── Helpers ─────────────────────────────────────────────────────

def _paper_to_dict(paper) -> dict:
    """Convert a Paper ORM object to a dictionary."""
    return {
        "id": paper.id,
        "filename": paper.filename,
        "title": paper.title,
        "authors": paper.authors,
        "year": paper.year,
        "doi": paper.doi,
        "page_count": paper.page_count,
        "file_size": paper.file_size,
        "language": paper.language,
        "status": paper.status,
        "tags": paper.tags,
        "notes": paper.notes,
        "auto_summary": getattr(paper, "auto_summary", ""),
        "read_status": paper.read_status,
        "starred": bool(paper.starred),
        "created_at": str(paper.created_at) if paper.created_at else None,
        "indexed_at": str(paper.indexed_at) if paper.indexed_at else None,
    }


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


# ─── Paper Import ────────────────────────────────────────────────

@router.post("/import")
async def import_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
):
    """Import a single document (PDF, DOCX, TXT, MD, HTML, EPUB)."""
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    file_id = str(uuid.uuid4())
    save_path = settings.papers_dir / f"{file_id}_{file.filename}"

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = await asyncio.to_thread(extract_document, str(save_path))
    if doc is None:
        raise HTTPException(status_code=400, detail=f"Cannot parse file: {file.filename}")

    session = get_session(state.engine)
    try:
        paper = Paper(
            id=file_id,
            filename=file.filename,
            title=doc.title,
            authors=doc.authors,
            year=doc.year,
            doi=doc.doi,
            page_count=doc.page_count,
            file_size=doc.file_size,
            file_path=str(save_path),
            language=doc.language,
            status="indexing",
        )
        session.add(paper)
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save paper metadata: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        session.close()

    background_tasks.add_task(_index_paper, file_id, doc)

    return {
        "paper_id": file_id,
        "filename": file.filename,
        "title": doc.title,
        "page_count": doc.page_count,
        "language": doc.language,
        "status": "indexing",
    }


@router.post("/import/folder")
async def import_folder(
    folder_path: str = Body(..., embed=True),
    background_tasks: BackgroundTasks = None,
):
    """Import all supported documents from a folder."""
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder_path}")

    doc_files = []
    for ext in SUPPORTED_EXTENSIONS:
        doc_files.extend(folder.glob(f"*{ext}"))
        doc_files.extend(folder.glob(f"*{ext.upper()}"))
    doc_files = sorted(set(doc_files))

    if not doc_files:
        raise HTTPException(status_code=400, detail="No supported documents found in the folder")

    import_results = []
    for doc_file in doc_files:
        try:
            doc = await asyncio.to_thread(extract_document, str(doc_file))
            if doc is None:
                import_results.append({
                    "filename": doc_file.name,
                    "status": "failed",
                    "error": "Cannot parse document",
                })
                continue

            file_id = str(uuid.uuid4())
            save_path = settings.papers_dir / f"{file_id}_{doc_file.name}"
            shutil.copy2(str(doc_file), str(save_path))

            session = get_session(state.engine)
            try:
                paper = Paper(
                    id=file_id,
                    filename=doc_file.name,
                    title=doc.title,
                    authors=doc.authors,
                    year=doc.year,
                    doi=doc.doi,
                    page_count=doc.page_count,
                    file_size=doc.file_size,
                    file_path=str(save_path),
                    language=doc.language,
                    status="indexing",
                )
                session.add(paper)
                session.commit()
            except Exception as e:
                session.rollback()
                import_results.append({
                    "filename": doc_file.name,
                    "status": "failed",
                    "error": str(e),
                })
                continue
            finally:
                session.close()

            background_tasks.add_task(_index_paper, file_id, doc)
            import_results.append({
                "filename": doc_file.name,
                "status": "indexing",
                "paper_id": file_id,
                "pages": doc.page_count,
            })

        except Exception as e:
            import_results.append({
                "filename": doc_file.name,
                "status": "error",
                "error": str(e),
            })

    return {
        "total": len(doc_files),
        "results": import_results,
    }


def _index_paper(file_id: str, doc):
    """
    Background indexing: chunk -> embed -> store in ChromaDB + FTS5.
    Runs as a background task after PDF import.
    """
    logger.info(f"Indexing paper: {file_id} ({doc.filename})")

    session = get_session(state.engine)
    try:
        chunks = chunk_text(
            doc.text_by_page,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        if not chunks:
            logger.warning(f"No chunks generated for {doc.filename}")
            session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
            session.commit()
            return

        logger.info(f"Generated {len(chunks)} chunks for {doc.filename}")

        for chunk in chunks:
            chunk.paper_id = file_id
            db_chunk = Chunk(
                paper_id=file_id,
                chunk_index=chunk.index,
                content=chunk.text,
                page_number=chunk.page_number,
                section_header=chunk.section_header,
                token_count=chunk.token_count,
            )
            session.add(db_chunk)
        session.commit()

        state.bm25._rebuild_fts()

        chunk_texts = [c.text for c in chunks]
        chunk_ids = [f"{file_id}_{c.index}" for c in chunks]
        metadatas = [
            {
                "paper_id": file_id,
                "paper_title": doc.title or doc.filename,
                "chunk_index": c.index,
                "page_number": c.page_number or 0,
                "section_header": c.section_header or "",
            }
            for c in chunks
        ]

        embeddings = state.embedder.embed(chunk_texts)
        state.vector.add_chunks(chunk_ids, embeddings, metadatas, chunk_texts)

        session.query(Paper).filter(Paper.id == file_id).update({"status": "indexed"})
        session.commit()

        try:
            intro_chunks = session.query(Chunk).filter(Chunk.paper_id == file_id).order_by(Chunk.chunk_index.asc()).limit(3).all()
            conclusion_chunk = session.query(Chunk).filter(Chunk.paper_id == file_id).order_by(Chunk.chunk_index.desc()).first()

            summary_context = "\n".join([c.content for c in intro_chunks])
            if conclusion_chunk and conclusion_chunk.chunk_index > 2:
                summary_context += f"\n\nKết luận:\n{conclusion_chunk.content}"

            summary_prompt = """Hãy viết một bản tóm tắt học thuật cực kỳ ngắn gọn và cấu trúc cho bài báo này. 
Trả về kết quả dưới định dạng Markdown như sau:

### 🧠 Tóm tắt tự động bởi ResearchMind:
* **Ý tưởng cốt lõi (Core Idea)**: [Viết 1 câu mô tả ý tưởng/mục tiêu chính]
* **Đóng góp chính (Contributions)**: [Viết 1-2 dòng về các đóng góp khoa học chính]
* **Điểm yếu / Hạn chế (Weaknesses)**: [Viết 1 dòng về các hạn chế được thảo luận]

Lưu ý: Viết bằng tiếng Việt súc tích, chuyên nghiệp."""

            result = state.generator.generate(
                query=summary_prompt,
                context_text=summary_context
            )

            if result and result.content:
                session.query(Paper).filter(Paper.id == file_id).update({
                    "auto_summary": result.content
                })
                session.commit()
                logger.info(f"Generated auto-summary for {doc.filename}")
        except Exception as sum_err:
            logger.warning(f"Auto-summary generation failed for {doc.filename}: {sum_err}")

        logger.info(f"Indexed {doc.filename}: {len(chunks)} chunks")

    except Exception as e:
        logger.error(f"Indexing failed for {doc.filename}: {e}")
        session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
        session.commit()
    finally:
        session.close()


# ─── Paper CRUD ──────────────────────────────────────────────────

@router.get("")
async def list_papers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc"),
):
    """List papers with filtering, sorting, and pagination."""
    session = get_session(state.engine)
    try:
        query = session.query(Paper)
        if status:
            query = query.filter(Paper.status == status)

        sort_col = getattr(Paper, sort_by, Paper.created_at)
        if order == "desc":
            query = query.order_by(sort_col.desc())
        else:
            query = query.order_by(sort_col.asc())

        total = query.count()
        papers = query.offset((page - 1) * limit).limit(limit).all()

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "papers": [_paper_to_dict(p) for p in papers],
        }
    finally:
        session.close()


@router.get("/{paper_id}")
async def get_paper(paper_id: str):
    """Get paper details."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        chunk_count = session.query(Chunk).filter(Chunk.paper_id == paper_id).count()

        result = _paper_to_dict(paper)
        result["chunk_count"] = chunk_count
        return result
    finally:
        session.close()


@router.patch("/{paper_id}")
async def update_paper(paper_id: str, update: dict):
    """Update paper metadata (tags, notes, read_status, starred)."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        allowed_fields = {"tags", "notes", "read_status", "starred"}
        for key, value in update.items():
            if key in allowed_fields:
                setattr(paper, key, value)

        session.commit()
        return _paper_to_dict(paper)
    finally:
        session.close()


@router.delete("/{paper_id}")
async def delete_paper(paper_id: str):
    """Delete paper and all associated data."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        try:
            state.vector.delete_paper_chunks(paper_id)
        except Exception as e:
            logger.warning(f"ChromaDB delete failed: {e}")

        session.delete(paper)
        session.commit()

        try:
            Path(paper.file_path).unlink(missing_ok=True)
        except Exception:
            pass

        state.bm25._rebuild_fts()

        return {"status": "deleted", "paper_id": paper_id}
    finally:
        session.close()


@router.get("/{paper_id}/file")
async def get_paper_file(paper_id: str):
    """Retrieve the raw PDF file for a paper."""
    from fastapi.responses import FileResponse

    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")
        path = Path(paper.file_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="PDF file not found on disk")
        return FileResponse(path, media_type="application/pdf")
    finally:
        session.close()


@router.get("/{paper_id}/related")
async def find_related_papers(paper_id: str, limit: int = Query(5)):
    """
    Find papers related to a given paper based on embedding similarity.
    """
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        chunks = session.query(Chunk).filter(Chunk.paper_id == paper_id).all()
        if not chunks:
            return {"related_papers": [], "paper_id": paper_id}

        chunk_ids = [f"{paper_id}_{chunks[0].chunk_index}"]

        try:
            collection = state.vector.collection
            results = collection.get(
                ids=chunk_ids,
                include=["embeddings"],
            )
            if not results["ids"] or len(results["embeddings"]) == 0:
                return {"related_papers": [], "paper_id": paper_id}

            query_embedding = results["embeddings"][0]
        except Exception as e:
            logger.warning(f"Failed to get embeddings for paper {paper_id}: {e}")
            return {"related_papers": [], "paper_id": paper_id}

        search_results = state.vector.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit * 3,
            include=["metadatas", "distances", "documents"],
        )

        all_related = {}
        if search_results["ids"] and search_results["ids"][0]:
            for i in range(len(search_results["ids"][0])):
                metadata = search_results["metadatas"][0][i]
                distance = search_results["distances"][0][i]
                similarity = 1.0 - distance
                other_paper_id = metadata.get("paper_id", "")

                if other_paper_id == paper_id:
                    continue

                if other_paper_id not in all_related:
                    all_related[other_paper_id] = {
                        "scores": [],
                        "snippet": search_results["documents"][0][i][:200],
                        "title": metadata.get("paper_title", ""),
                    }
                all_related[other_paper_id]["scores"].append(similarity)

        related_papers = []
        for pid, data in all_related.items():
            avg_score = sum(data["scores"]) / len(data["scores"])
            related_papers.append({
                "paper_id": pid,
                "title": data["title"],
                "similarity": round(avg_score, 4),
                "snippet": data["snippet"],
                "matching_chunks": len(data["scores"]),
            })

        related_papers.sort(key=lambda x: x["similarity"], reverse=True)

        return {
            "related_papers": related_papers[:limit],
            "paper_id": paper_id,
        }
    finally:
        session.close()


# ─── Citations ───────────────────────────────────────────────────

@router.post("/cite")
async def generate_citations(body: dict):
    """
    Generate formatted academic citations for papers.
    Supports APA, IEEE, Vancouver, BibTeX, and HTML styles.
    """
    paper_ids = body.get("paper_ids", [])
    style = body.get("style", "apa")

    if not paper_ids:
        return {"citations": [], "style": style, "message": "No paper IDs provided."}

    from datetime import datetime

    session = get_session(state.engine)
    try:
        citations = []
        for pid in paper_ids:
            paper = session.query(Paper).filter(Paper.id == pid).first()
            if not paper:
                continue

            try:
                authors_list = json.loads(paper.authors) if paper.authors else []
            except (json.JSONDecodeError, TypeError):
                authors_list = [a.strip() for a in paper.authors.split(",")] if paper.authors else ["Unknown"]

            title = paper.title or paper.filename.replace(".pdf", "").replace("_", " ")
            year = paper.year or "n.d."
            doi = paper.doi or ""
            pages = paper.page_count

            if style == "apa":
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

            elif style == "ieee":
                if len(authors_list) == 0:
                    author_str = "Unknown"
                elif len(authors_list) <= 3:
                    author_str = ", ".join(authors_list)
                else:
                    author_str = ", ".join(authors_list[:3]) + ", et al."

                formatted = f"{author_str}, \"{title}\", {year}"
                if pages:
                    formatted += f", pp. 1-{pages}"
                formatted += "."
                if doi:
                    formatted += f" doi: {doi}."

            elif style == "vancouver":
                if len(authors_list) == 0:
                    author_str = "Unknown"
                elif len(authors_list) <= 6:
                    author_str = ", ".join(authors_list)
                else:
                    author_str = ", ".join(authors_list[:6]) + ", et al."

                formatted = f"{author_str}. {title}. {year}"
                if pages:
                    formatted += f"; 1-{pages}"
                formatted += "."
                if doi:
                    formatted += f" doi: {doi}."

            elif style == "bibtex":
                if len(authors_list) > 0:
                    first_author = authors_list[0]
                    if ", " in first_author:
                        last_name = first_author.split(",")[0].strip()
                    else:
                        parts = first_author.strip().split()
                        last_name = parts[-1] if parts else "unknown"
                    cite_key = re.sub(r'[^a-zA-Z0-9_]', '', last_name.lower())[:20]
                else:
                    cite_key = "unknown"
                year_bib = str(year) if year != "n.d." else "n.d."
                if year_bib != "n.d.":
                    cite_key += year_bib

                bibtex_authors = []
                for a in authors_list:
                    a = a.strip()
                    if ", " in a:
                        bibtex_authors.append(a)
                    else:
                        parts = a.rsplit(" ", 1)
                        if len(parts) == 2:
                            bibtex_authors.append(f"{parts[1]}, {parts[0]}")
                        else:
                            bibtex_authors.append(a)
                author_str_bib = " and ".join(bibtex_authors)

                formatted = f"@article{{{cite_key},\n"
                if author_str_bib:
                    formatted += f"  author = {{{author_str_bib}}},\n"
                formatted += f"  title = {{{title}}},\n"
                formatted += f"  year = {{{year_bib}}},\n"
                if doi:
                    formatted += f"  doi = {{{doi}}},\n"
                if pages:
                    formatted += f"  pages = {{1--{pages}}},\n"
                formatted += "}"

            elif style == "html":
                year_str = str(year) if year != "n.d." else "n.d."
                doi_str = doi if doi else ""
                pages_str = f"pp. 1\u2013{pages}" if pages else ""

                if len(authors_list) == 0:
                    author_display = "Unknown"
                elif len(authors_list) <= 3:
                    author_display = ", ".join(authors_list)
                else:
                    author_display = ", ".join(authors_list[:3]) + " et al."

                entry_html_lines = []
                entry_html_lines.append(f'<div class="cite-entry">')
                entry_html_lines.append(f'  <span class="cite-num">[{len(citations) + 1}]</span>')
                entry_html_lines.append(f'  <div class="cite-body">')
                entry_html_lines.append(f'    <span class="cite-authors">{_escape_html(author_display)}</span>')
                entry_html_lines.append(f'    <span class="cite-title">{_escape_html(title)}</span>')
                entry_html_lines.append(f'    <span class="cite-year">({year_str})</span>')
                if pages_str:
                    entry_html_lines.append(f'    <span class="cite-pages">{pages_str}</span>')
                if doi_str:
                    entry_html_lines.append(f'    <span class="cite-doi">DOI: <a href="https://doi.org/{_escape_html(doi_str)}" target="_blank">{_escape_html(doi_str)}</a></span>')
                entry_html_lines.append(f'  </div>')
                entry_html_lines.append(f'</div>')
                formatted = "\n".join(entry_html_lines)

            else:
                if len(authors_list) == 0:
                    author_str = "Unknown"
                elif len(authors_list) <= 6:
                    author_str = ", ".join(authors_list)
                else:
                    author_str = ", ".join(authors_list[:6]) + ", et al."

                formatted = f"{author_str}. {title}. {year}"
                if pages:
                    formatted += f"; 1-{pages}"
                formatted += "."
                if doi:
                    formatted += f" doi: {doi}."

            citations.append({
                "paper_id": paper.id,
                "title": title,
                "authors": authors_list,
                "year": year,
                "doi": doi,
                "pages": pages,
                "formatted": formatted,
                "style": style,
            })

        if style == "html":
            entries = "\n".join([c["formatted"] for c in citations])
            today = datetime.now().strftime("%Y-%m-%d %H:%M")
            bibliography = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bibliography — ResearchMind VN</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Georgia', 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }}
  h1 {{ font-size: 22pt; font-weight: 700; color: #111; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 24px; }}
  .cite-entry {{ display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }}
  .cite-entry:last-child {{ border-bottom: none; }}
  .cite-num {{ font-size: 10pt; font-weight: 700; color: #6366f1; min-width: 32px; text-align: right; flex-shrink: 0; padding-top: 2px; }}
  .cite-body {{ flex: 1; display: flex; flex-direction: column; gap: 2px; }}
  .cite-authors {{ font-weight: 600; font-size: 11pt; color: #111; }}
  .cite-title {{ font-style: italic; font-size: 11pt; color: #333; }}
  .cite-year {{ font-size: 10pt; color: #666; }}
  .cite-pages {{ font-size: 10pt; color: #666; }}
  .cite-doi {{ font-size: 9pt; }}
  .cite-doi a {{ color: #6366f1; text-decoration: none; }}
  .cite-doi a:hover {{ text-decoration: underline; }}
  .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #999; text-align: center; }}
  @media print {{ body {{ padding: 20px; }} h1 {{ font-size: 18pt; }} .cite-entry {{ break-inside: avoid; }} }}
</style>
</head>
<body>
<h1>Bibliography</h1>
{entries}
<div class="footer">
  Generated by ResearchMind VN on {today} — {len(citations)} citation(s)
</div>
</body>
</html>"""
        else:
            bibliography = "\n\n".join([c["formatted"] for c in citations])

        return {
            "citations": citations,
            "bibliography": bibliography,
            "style": style,
            "count": len(citations),
        }
    finally:
        session.close()


# ─── Highlights ──────────────────────────────────────────────────

@router.get("/{paper_id}/highlights")
async def get_paper_highlights(paper_id: str, limit: int = Query(10)):
    """
    AI identifies and returns the most important passages in a paper.
    """
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        retrieval = await asyncio.to_thread(
            state.retriever.retrieve,
            query="key findings methodology results conclusion abstract introduction important contributions novel results findings limitations weaknesses",
            paper_ids=[paper_id],
            top_k=20,
        )

        if not retrieval.context_text.strip():
            return {
                "highlights": [],
                "paper_id": paper_id,
                "message": "Paper chưa được index đầy đủ để tạo highlights.",
            }

        highlight_prompt = f"""Bạn là một trợ lý nghiên cứu. Hãy đọc kỹ toàn bộ nội dung paper sau và xác định {limit} đoạn quan trọng nhất.

Đối với mỗi đoạn quan trọng, hãy trả về JSON array với cấu trúc:
[
  {{
    "category": "key_finding" | "methodology" | "conclusion" | "novel_contribution" | "limitation" | "important_claim",
    "text": "đoạn trích nguyên văn (tối đa 200 ký tự)",
    "page_hint": số trang nếu biết (hoặc null),
    "importance": "high" | "medium",
    "note": "giải thích ngắn gọn tại sao đoạn này quan trọng"
  }}
]

Phân loại:
- key_finding: Kết quả nghiên cứu chính
- methodology: Phương pháp quan trọng
- conclusion: Kết luận then chốt
- novel_contribution: Đóng góp mới / sáng kiến
- limitation: Hạn chế được thảo luận
- important_claim: Khái niệm/quan điểm quan trọng

CHỈ trả về JSON array, không thêm text khác. Trả lời bằng tiếng Việt.

Nội dung paper:\n{retrieval.context_text}"""

        generation = await asyncio.to_thread(
            state.generator.generate,
            query=highlight_prompt,
            context_text=retrieval.context_text,
        )

        highlights = []
        try:
            content = generation.content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            start = content.find('[')
            end = content.rfind(']')
            if start != -1 and end != -1:
                json_str = content[start:end + 1]
                highlights = json.loads(json_str)
        except Exception as parse_err:
            logger.warning(f"Failed to parse highlights JSON: {parse_err}")
            highlights = []

        return {
            "highlights": highlights[:limit],
            "paper_id": paper_id,
            "paper_title": paper.title,
        }
    finally:
        session.close()
