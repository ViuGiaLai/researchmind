import asyncio
import json
import re
import shutil
import threading
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Body, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from loguru import logger
from sqlalchemy import or_

from app_state import state
from common.i18n import t
from config.settings import settings
from db.database import get_session
from db.models import Annotation, Chunk, CollectionPaper, ImportJob, Paper
from ingestion.chunker import SentenceSplitter
from ingestion.metadata_quality import (
    clean_authors,
    display_title,
    is_poor_title,
    repair_vietnamese_ocr_text,
    resolve_paper_title,
)
from ingestion.parser import (
    IMAGE_EXTENSIONS,
    SUPPORTED_EXTENSIONS,
    create_image_stub_document,
    extract_document,
)
from utils.pdf_annotator import add_highlights_to_pdf, save_highlighted_pdf

router = APIRouter(prefix="/api/papers", tags=["Papers"])
jobs_router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


# ─── Helpers ─────────────────────────────────────────────────────


def _parse_authors(authors_str: str) -> list[str]:
    if not authors_str:
        return []
    try:
        val = json.loads(authors_str)
        if isinstance(val, list):
            return clean_authors([str(a) for a in val])
    except (json.JSONDecodeError, TypeError):
        pass

    try:
        val = json.loads(authors_str.replace("'", '"'))
        if isinstance(val, list):
            return clean_authors([str(a) for a in val])
    except Exception:
        pass

    import re

    cleaned = re.sub(r"[\[\]'\"#]", "", authors_str)
    return clean_authors([a.strip() for a in cleaned.split(",") if a.strip()])


def _resolve_doc_title(doc, original_filename: str | None = None) -> str:
    """Score-based title from metadata, page text, and original filename."""
    return resolve_paper_title(
        metadata_title=getattr(doc, "title", None),
        suggested_title=getattr(doc, "suggested_title", None),
        filename=original_filename or getattr(doc, "filename", None),
        stored_path=getattr(doc, "path", None),
    )


def _parse_highlights_json(content: str) -> list[dict]:
    content = content.strip()
    start = content.find("[")
    end = content.rfind("]")
    if start == -1:
        raise ValueError("No JSON array found in response")
    # Models can hit the output-token limit after one or more complete objects.
    # Keep the truncated tail so repair/partial-object extraction can salvage
    # every complete highlight instead of exposing raw JSON to the UI.
    json_str = content[start : end + 1] if end > start else content[start:]

    try:
        return _validate_highlights(json.loads(json_str))
    except json.JSONDecodeError:
        pass

    repaired = _repair_truncated_json(json_str)
    try:
        return _validate_highlights(json.loads(repaired))
    except json.JSONDecodeError:
        pass

    objects = _extract_partial_objects(json_str)
    if objects:
        return _validate_highlights(objects)

    raise ValueError("Could not parse highlights JSON after all repair attempts")


def _validate_highlights(value: object) -> list[dict]:
    """Keep only complete highlight objects from model-generated JSON."""
    if not isinstance(value, list):
        raise ValueError("Highlights response must be a JSON array")

    required_fields = {"category", "text", "page_hint", "importance", "note"}
    allowed_categories = {
        "key_finding",
        "methodology",
        "conclusion",
        "novel_contribution",
        "limitation",
        "important_claim",
    }
    valid: list[dict] = []
    for item in value:
        if not isinstance(item, dict) or not required_fields.issubset(item):
            continue
        if item["category"] not in allowed_categories:
            continue
        if item["importance"] not in {"high", "medium"}:
            continue
        if not isinstance(item["text"], str) or not item["text"].strip():
            continue
        if not isinstance(item["note"], str):
            continue
        page_hint = item["page_hint"]
        if page_hint is not None and (not isinstance(page_hint, int) or isinstance(page_hint, bool) or page_hint < 1):
            continue
        valid.append(item)

    if not valid:
        raise ValueError("No complete highlight objects found in response")
    return valid


def _repair_truncated_json(s: str) -> str:
    in_string = False
    escape = False
    quote_char = None
    result = []

    for ch in s:
        if escape:
            result.append(ch)
            escape = False
            continue
        if ch == "\\":
            result.append(ch)
            escape = True
            continue
        if in_string:
            result.append(ch)
            if ch == quote_char:
                in_string = False
                quote_char = None
            elif ch == "\n":
                result.append("\\n")
        else:
            if ch in ('"', "'"):
                in_string = True
                quote_char = ch
            result.append(ch)

    if in_string:
        result.append(quote_char)

    s2 = "".join(result)

    stack = []
    last_valid_end = -1
    in_str = False
    esc = False
    q = None
    for i, ch in enumerate(s2):
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if in_str:
            if ch == q:
                in_str = False
                q = None
            continue
        if ch in ('"', "'"):
            in_str = True
            q = ch
        elif ch in ("[", "{"):
            stack.append(ch)
        elif ch in ("]", "}"):
            if stack:
                stack.pop()
                if not stack:
                    last_valid_end = i
            else:
                pass

    if in_str:
        stack.append(q)

    if stack:
        if last_valid_end >= 0:
            s2 = s2[: last_valid_end + 1]
        close_map = {"[": "]", "{": "}", '"': '"', "'": "'"}
        for b in reversed(stack):
            s2 += close_map.get(b, "]")

    return s2


def _extract_partial_objects(s: str) -> list[dict]:
    objects = []
    i = 0
    while i < len(s):
        i = s.find("{", i)
        if i == -1:
            break
        depth = 0
        in_str = False
        esc = False
        quote = None
        j = i
        try:
            while j < len(s):
                ch = s[j]
                if esc:
                    esc = False
                    j += 1
                    continue
                if ch == "\\":
                    esc = True
                    j += 1
                    continue
                if in_str:
                    if ch == quote:
                        in_str = False
                        quote = None
                else:
                    if ch in ('"', "'"):
                        in_str = True
                        quote = ch
                    elif ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            try:
                                obj = json.loads(s[i : j + 1])
                                if isinstance(obj, dict):
                                    objects.append(obj)
                            except json.JSONDecodeError:
                                pass
                            i = j
                            break
                j += 1
        except (IndexError, ValueError):
            pass
        i += 1

    return objects


def _paper_to_dict(paper) -> dict:
    """Convert a Paper ORM object to a dictionary."""
    safe_title = display_title(paper.title, paper.filename)
    raw_summary = getattr(paper, "auto_summary", "") or ""
    safe_summary = repair_vietnamese_ocr_text(raw_summary) if raw_summary else ""
    thumb_path = settings.data_dir / "thumbs" / f"{paper.id}.jpg"
    file_ext = Path(paper.file_path).suffix.lower()
    if thumb_path.exists():
        thumbnail_url = f"http://127.0.0.1:{settings.port}/static/thumbs/{paper.id}.jpg"
    elif file_ext in IMAGE_EXTENSIONS and Path(paper.file_path).exists():
        # For images, serve the file itself as the thumbnail
        from urllib.parse import quote

        fname = Path(paper.file_path).name
        thumbnail_url = f"http://127.0.0.1:{settings.port}/static/papers/{quote(fname)}"
    else:
        thumbnail_url = ""
    return {
        "id": paper.id,
        "filename": paper.filename,
        "title": safe_title,
        "authors": json.dumps(_parse_authors(paper.authors), ensure_ascii=False),
        "year": paper.year,
        "doi": paper.doi,
        "page_count": paper.page_count,
        "file_size": paper.file_size,
        "language": paper.language,
        "status": paper.status,
        "ocr_pages_count": getattr(paper, "ocr_pages_count", 0) or 0,
        "ocr_pages_failed": getattr(paper, "ocr_pages_failed", 0) or 0,
        "is_scanned": bool(getattr(paper, "is_scanned", 0)),
        "layout_stats": _parse_layout_stats(getattr(paper, "layout_stats", "")),
        "tags": paper.tags,
        "notes": paper.notes,
        "auto_summary": safe_summary,
        "auto_summary_lang": getattr(paper, "auto_summary_lang", "") or "",
        "read_status": paper.read_status,
        "starred": bool(paper.starred),
        "thumbnail_url": thumbnail_url,
        "created_at": str(paper.created_at) if paper.created_at else None,
        "indexed_at": str(paper.indexed_at) if paper.indexed_at else None,
    }


def _parse_layout_stats(raw: str) -> dict | None:
    """Parse layout_stats JSON string, return None if empty or invalid."""
    if not raw or raw == "{}":
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _job_to_dict(job: ImportJob) -> dict:
    return {
        "id": job.id,
        "paper_id": job.paper_id,
        "filename": job.filename,
        "source_path": job.source_path,
        "file_path": job.file_path,
        "status": job.status,
        "stage": job.stage,
        "progress": job.progress,
        "error": job.error,
        "ocr_pages_count": job.ocr_pages_count or 0,
        "ocr_pages_failed": job.ocr_pages_failed or 0,
        "is_scanned": bool(job.is_scanned),
        "attempts": job.attempts or 0,
        "created_at": str(job.created_at) if job.created_at else None,
        "updated_at": str(job.updated_at) if job.updated_at else None,
        "finished_at": str(job.finished_at) if job.finished_at else None,
    }


def _create_import_job(filename: str, source_path: str = "") -> str:
    session = get_session(state.engine)
    try:
        job = ImportJob(filename=filename, source_path=source_path, status="queued", stage="queued", progress=0)
        session.add(job)
        session.commit()
        return job.id
    finally:
        session.close()


def _update_import_job(job_id: str | None, **fields) -> None:
    if not job_id:
        return
    session = get_session(state.engine)
    try:
        job = session.query(ImportJob).filter(ImportJob.id == job_id).first()
        if not job:
            return
        for key, value in fields.items():
            if hasattr(job, key):
                setattr(job, key, value)
        job.updated_at = datetime.utcnow()
        if fields.get("status") in {"ready", "failed", "needs_ocr"}:
            job.finished_at = datetime.utcnow()
            if job.created_at:
                elapsed = max((job.finished_at - job.created_at).total_seconds(), 0.001)
                logger.info(
                    "IMPORT_TIMING "
                    f"job_id={job.id} status={fields.get('status')} "
                    f"filename={job.filename} elapsed={elapsed:.2f}s "
                    f"files_per_min={60.0 / elapsed:.2f}"
                )
        session.commit()
    except Exception as e:
        session.rollback()
        logger.warning(f"Failed to update import job {job_id}: {e}")
    finally:
        session.close()


def _document_needs_ocr(doc) -> bool:
    text_len = len((doc.full_text or "").strip())
    page_count = max(doc.page_count or 1, 1)
    return bool(getattr(doc, "is_scanned", False)) and text_len < max(120, page_count * 40)


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
            detail=f"Unsupported file format '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    file_id = str(uuid.uuid4())
    safe_name = Path(file.filename or "untitled").name
    save_path = settings.papers_dir / f"{file_id}_{safe_name}"
    job_id = _create_import_job(safe_name)
    _update_import_job(job_id, status="saved", stage="saved", progress=10, paper_id=file_id, file_path=str(save_path))

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    is_image = ext in IMAGE_EXTENSIONS
    if is_image:
        # Return immediately; RapidOCR model load can take minutes on first run.
        doc = create_image_stub_document(str(save_path), file.filename)
        paper_title = _resolve_doc_title(doc, file.filename or safe_name)

        session = get_session(state.engine)
        try:
            paper = Paper(
                id=file_id,
                filename=file.filename,
                title=paper_title,
                authors=doc.authors,
                year=doc.year,
                doi=doc.doi,
                page_count=doc.page_count,
                file_size=doc.file_size,
                file_path=str(save_path),
                language=doc.language,
                status="indexing",
                ocr_pages_count=getattr(doc, "ocr_pages_count", 0),
                ocr_pages_failed=getattr(doc, "ocr_pages_failed", 0),
                is_scanned=1 if getattr(doc, "is_scanned", False) else 0,
                layout_stats=json.dumps(getattr(doc, "layout_stats", None) or {}),
            )
            session.add(paper)
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to save image paper metadata: {e}")
            _update_import_job(job_id, status="failed", stage="saved", progress=100, error=f"Database error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        finally:
            session.close()

        background_tasks.add_task(
            _parse_and_index_image_paper,
            file_id,
            str(save_path),
            job_id,
            file.filename or safe_name,
        )
        return {
            "paper_id": file_id,
            "job_id": job_id,
            "filename": file.filename,
            "title": paper_title,
            "page_count": doc.page_count,
            "language": doc.language,
            "status": "parsing",
            "ocr_pages_count": getattr(doc, "ocr_pages_count", 0),
            "ocr_pages_failed": getattr(doc, "ocr_pages_failed", 0),
            "is_scanned": bool(getattr(doc, "is_scanned", False)),
        }

    background_tasks.add_task(
        _parse_and_index_document_paper,
        file_id,
        str(save_path),
        job_id,
        file.filename or safe_name,
    )

    return {
        "paper_id": file_id,
        "job_id": job_id,
        "filename": file.filename,
        "title": Path(file.filename or safe_name).stem,
        "page_count": None,
        "language": "unknown",
        "status": "parsing",
        "ocr_pages_count": 0,
        "ocr_pages_failed": 0,
        "is_scanned": False,
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
        job_id = _create_import_job(doc_file.name, str(doc_file))
        try:
            _update_import_job(job_id, status="parsing", stage="parsing", progress=20)
            doc = await asyncio.to_thread(extract_document, str(doc_file))
            if doc is None:
                _update_import_job(
                    job_id, status="failed", stage="parsing", progress=100, error="Cannot parse document"
                )
                import_results.append(
                    {
                        "job_id": job_id,
                        "filename": doc_file.name,
                        "status": "failed",
                        "error": "Cannot parse document",
                    }
                )
                continue

            file_id = str(uuid.uuid4())
            save_path = settings.papers_dir / f"{file_id}_{doc_file.name}"
            shutil.copy2(str(doc_file), str(save_path))
            _update_import_job(
                job_id, status="saved", stage="saved", progress=35, paper_id=file_id, file_path=str(save_path)
            )

            paper_title = _resolve_doc_title(doc, doc_file.name)

            session = get_session(state.engine)
            try:
                paper = Paper(
                    id=file_id,
                    filename=doc_file.name,
                    title=paper_title,
                    authors=doc.authors,
                    year=doc.year,
                    doi=doc.doi,
                    page_count=doc.page_count,
                    file_size=doc.file_size,
                    file_path=str(save_path),
                    language=doc.language,
                    status="indexing",
                    ocr_pages_count=getattr(doc, "ocr_pages_count", 0),
                    ocr_pages_failed=getattr(doc, "ocr_pages_failed", 0),
                    is_scanned=1 if getattr(doc, "is_scanned", False) else 0,
                )
                session.add(paper)
                session.commit()
            except Exception as e:
                session.rollback()
                _update_import_job(job_id, status="failed", stage="saved", progress=100, error=str(e))
                import_results.append(
                    {
                        "job_id": job_id,
                        "filename": doc_file.name,
                        "status": "failed",
                        "error": str(e),
                    }
                )
                continue
            finally:
                session.close()

            background_tasks.add_task(_index_paper, file_id, doc, job_id)
            background_tasks.add_task(
                _enrich_paper_background,
                paper_id=file_id,
                file_path=str(save_path),
                title=paper_title or doc_file.name,
                authors=_parse_authors(doc.authors),
            )
            import_results.append(
                {
                    "job_id": job_id,
                    "filename": doc_file.name,
                    "status": "indexing",
                    "paper_id": file_id,
                    "pages": doc.page_count,
                    "ocr_pages_count": getattr(doc, "ocr_pages_count", 0),
                    "ocr_pages_failed": getattr(doc, "ocr_pages_failed", 0),
                    "is_scanned": bool(getattr(doc, "is_scanned", False)),
                }
            )

        except Exception as e:
            _update_import_job(job_id, status="failed", stage="import", progress=100, error=str(e))
            import_results.append(
                {
                    "job_id": job_id,
                    "filename": doc_file.name,
                    "status": "error",
                    "error": str(e),
                }
            )

    return {
        "total": len(doc_files),
        "results": import_results,
    }


@router.post("/import/metadata")
async def import_metadata(body: dict = Body(...)):
    """Import a paper by metadata (no PDF). Creates a stub Paper record."""
    from db.models import Paper as PaperModel

    doi = (body.get("doi") or "").strip()
    title = (body.get("title") or "Untitled").strip()
    authors = body.get("authors", [])
    year = body.get("year")
    abstract = (body.get("abstract") or "").strip()

    if not title:
        raise HTTPException(status_code=400, detail="Missing required field: title")

    session = get_session(state.engine)
    try:
        file_id = str(uuid.uuid4())
        safe_name = re.sub(r"[^\w\- ]", "", title)[:60]
        file_path = str(settings.papers_dir / f"metadata_{file_id}_{safe_name}.pdf")

        paper = PaperModel(
            id=file_id,
            filename=f"{safe_name}.pdf",
            title=title,
            authors=json.dumps(authors, ensure_ascii=False),
            year=year,
            doi=doi,
            abstract=abstract,
            file_path=file_path,
            status="metadata_only",
        )
        session.add(paper)
        session.commit()
        logger.info(f"IMPORT_METADATA created paper {file_id}: {title}")
        return {"paper_id": file_id, "title": title, "status": "metadata_only"}
    except Exception as e:
        session.rollback()
        logger.error(f"IMPORT_METADATA failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


def _extract_keywords_local(text: str, top_n: int = 5) -> list[str]:
    """
    Extract top N keywords from a text locally.
    Uses clean word filtering, stopwords removal, and frequency analysis.
    """
    import re
    from collections import Counter

    # Define standard stopwords for Vietnamese and English
    stopwords = {
        "và",
        "hoặc",
        "của",
        "cho",
        "trong",
        "ngoài",
        "là",
        "bởi",
        "tại",
        "với",
        "các",
        "những",
        "cái",
        "được",
        "bị",
        "ra",
        "vào",
        "lên",
        "xuống",
        "đến",
        "đi",
        "này",
        "kia",
        "đó",
        "ấy",
        "sự",
        "cuộc",
        "việc",
        "như",
        "như_vậy",
        "thế_nào",
        "vì",
        "nên",
        "thì",
        "mà",
        "the",
        "and",
        "of",
        "to",
        "in",
        "for",
        "with",
        "on",
        "at",
        "by",
        "an",
        "is",
        "this",
        "that",
        "from",
        "are",
        "was",
        "were",
        "be",
        "has",
        "have",
        "had",
        "with",
        "as",
        "it",
        "its",
        "we",
        "our",
        "you",
        "your",
        "they",
        "their",
        "he",
        "she",
        "him",
        "her",
        "who",
        "which",
        "what",
        "where",
        "when",
        "why",
        "how",
    }

    # Normalize text
    text_lower = text.lower()

    # Extract words
    words = re.findall(r"\b[a-z_àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]+\b", text_lower)

    # Filter unigrams
    filtered_unigrams = [w for w in words if len(w) > 3 and w not in stopwords and not w.isdigit()]

    # Calculate frequencies of unigrams
    unigram_counts = Counter(filtered_unigrams)

    # Extract bigrams
    bigrams = []
    for i in range(len(words) - 1):
        w1, w2 = words[i], words[i + 1]
        if (
            len(w1) > 2
            and len(w2) > 2
            and w1 not in stopwords
            and w2 not in stopwords
            and not w1.isdigit()
            and not w2.isdigit()
        ):
            bigrams.append(f"{w1} {w2}")

    bigram_counts = Counter(bigrams)

    # Combine candidates
    candidates = {}

    # Add bigrams with a small frequency boost
    for k, v in bigram_counts.most_common(15):
        candidates[k] = v * 1.5

    for k, v in unigram_counts.most_common(20):
        is_sub = False
        for cand in candidates:
            if k in cand.split():
                is_sub = True
                break
        if not is_sub:
            candidates[k] = v

    sorted_candidates = sorted(candidates.items(), key=lambda x: x[1], reverse=True)

    # Format and capitalize first letter
    extracted = []
    for kw, _ in sorted_candidates[:top_n]:
        capitalized = " ".join(word.capitalize() for word in kw.split())
        extracted.append(capitalized)

    return extracted


def _parse_and_index_image_paper(
    file_id: str,
    file_path: str,
    job_id: str | None,
    filename: str,
):
    """OCR + index image files in background (RapidOCR cold start can take minutes)."""
    logger.info(f"Background OCR/index for image: {filename}")
    _update_import_job(job_id, status="parsing", stage="ocr", progress=30)

    try:
        doc = extract_document(file_path)
    except Exception as exc:
        logger.exception(f"Image OCR failed for {filename}: {exc}")
        doc = None

    if doc is None:
        _update_import_job(
            job_id,
            status="failed",
            stage="ocr",
            progress=100,
            error=t("import.ocr_fail"),
        )
        session = get_session(state.engine)
        try:
            session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
            session.commit()
        finally:
            session.close()
        return

    paper_title = _resolve_doc_title(doc, filename)
    session = get_session(state.engine)
    try:
        session.query(Paper).filter(Paper.id == file_id).update(
            {
                "title": paper_title,
                "authors": json.dumps(_parse_authors(doc.authors), ensure_ascii=False),
                "year": doc.year,
                "doi": doc.doi,
                "page_count": doc.page_count,
                "file_size": doc.file_size,
                "language": doc.language,
                "ocr_pages_count": getattr(doc, "ocr_pages_count", 0),
                "ocr_pages_failed": getattr(doc, "ocr_pages_failed", 0),
                "is_scanned": 1 if getattr(doc, "is_scanned", False) else 0,
                "status": "indexing",
            }
        )
        session.commit()
    finally:
        session.close()

    _index_paper(file_id, doc, job_id)

    authors: list[str] = []
    if doc.authors:
        try:
            parsed = json.loads(doc.authors)
            if isinstance(parsed, list):
                authors = parsed
        except (json.JSONDecodeError, TypeError):
            authors = [a.strip() for a in doc.authors.split(",") if a.strip()]

    try:
        asyncio.run(
            _enrich_paper_background(
                paper_id=file_id,
                file_path=file_path,
                title=paper_title or filename,
                authors=authors,
            )
        )
    except Exception:
        pass


def _parse_and_index_document_paper(
    file_id: str,
    file_path: str,
    job_id: str | None,
    filename: str,
):
    """Parse + index non-image documents in the background."""
    logger.info(f"Background parse/index for document: {filename}")
    _update_import_job(job_id, status="parsing", stage="parsing", progress=25)

    try:
        doc = extract_document(file_path)
    except Exception as exc:
        logger.exception(f"Document parse failed for {filename}: {exc}")
        doc = None

    if doc is None:
        err = f"Cannot parse file: {filename}"
        logger.warning(f"Import failed for {filename}: parser returned no content")
        _update_import_job(job_id, status="failed", stage="parsing", progress=100, error=err)
        return

    paper_title = _resolve_doc_title(doc, filename)

    session = get_session(state.engine)
    try:
        paper = Paper(
            id=file_id,
            filename=filename,
            title=paper_title,
            authors=json.dumps(_parse_authors(doc.authors), ensure_ascii=False),
            year=doc.year,
            doi=doc.doi,
            page_count=doc.page_count,
            file_size=doc.file_size,
            file_path=file_path,
            language=doc.language,
            status="indexing",
            ocr_pages_count=getattr(doc, "ocr_pages_count", 0),
            ocr_pages_failed=getattr(doc, "ocr_pages_failed", 0),
            is_scanned=1 if getattr(doc, "is_scanned", False) else 0,
            layout_stats=json.dumps(getattr(doc, "layout_stats", None) or {}),
        )
        session.add(paper)
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save paper metadata: {e}")
        _update_import_job(job_id, status="failed", stage="saved", progress=100, error=f"Database error: {str(e)}")
        return
    finally:
        session.close()

    _update_import_job(
        job_id,
        status="indexing",
        stage="indexing",
        progress=40,
        paper_id=file_id,
        ocr_pages_count=getattr(doc, "ocr_pages_count", 0),
        ocr_pages_failed=getattr(doc, "ocr_pages_failed", 0),
        is_scanned=1 if getattr(doc, "is_scanned", False) else 0,
    )
    _index_paper(file_id, doc, job_id)

    try:
        asyncio.run(
            _enrich_paper_background(
                paper_id=file_id,
                file_path=file_path,
                title=paper_title or filename,
                authors=_parse_authors(doc.authors),
            )
        )
    except Exception:
        pass


def _index_paper(file_id: str, doc, job_id: str | None = None):
    """
    Background indexing: chunk -> embed -> store in ChromaDB + FTS5.
    Runs as a background task after PDF import.
    """
    logger.info(f"Indexing paper: {file_id} ({doc.filename})")
    _update_import_job(
        job_id,
        status="indexing",
        stage="indexing",
        progress=45,
        ocr_pages_count=getattr(doc, "ocr_pages_count", 0),
        ocr_pages_failed=getattr(doc, "ocr_pages_failed", 0),
        is_scanned=1 if getattr(doc, "is_scanned", False) else 0,
    )

    session = get_session(state.engine)
    try:
        splitter = SentenceSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        chunks = splitter.chunk_text(doc.text_by_page)

        if not chunks:
            logger.warning(f"No chunks generated for {doc.filename}")
            next_status = "needs_ocr" if getattr(doc, "is_scanned", False) else "failed"
            session.query(Paper).filter(Paper.id == file_id).update({"status": next_status})
            session.commit()
            _update_import_job(
                job_id,
                status=next_status,
                stage="ocr" if next_status == "needs_ocr" else "indexing",
                progress=100,
                error=t("import.pdf_retry_scanned") if next_status == "needs_ocr" else t("import.chunk_fail"),
            )
            return

        logger.info(f"Generated {len(chunks)} chunks for {doc.filename}")
        _update_import_job(job_id, status="indexing", stage="indexing", progress=60)

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
                "paper_title": _resolve_doc_title(doc, getattr(doc, "filename", None)),
                "chunk_index": c.index,
                "page_number": c.page_number or 0,
                "section_header": c.section_header or "",
            }
            for c in chunks
        ]

        embeddings = state.embedder.embed(chunk_texts)
        state.vector.add_chunks(chunk_ids, embeddings, metadatas, chunk_texts)

        _update_import_job(job_id, status="summarizing", stage="summarizing", progress=82)
        session.query(Paper).filter(Paper.id == file_id).update({"status": "summarizing"})
        session.commit()

        # Extract keywords and save as tags automatically
        try:
            keywords = _extract_keywords_local(doc.full_text, top_n=5)
            session.query(Paper).filter(Paper.id == file_id).update({"tags": json.dumps(keywords)})
            session.commit()
            logger.info(f"Extracted keywords for {doc.filename}: {keywords}")
        except Exception as kw_err:
            logger.warning(f"Keyword extraction failed for {doc.filename}: {kw_err}")

        try:
            intro_chunks = (
                session.query(Chunk).filter(Chunk.paper_id == file_id).order_by(Chunk.chunk_index.asc()).limit(3).all()
            )
            conclusion_chunk = (
                session.query(Chunk).filter(Chunk.paper_id == file_id).order_by(Chunk.chunk_index.desc()).first()
            )

            summary_context = "\n".join([c.content for c in intro_chunks])
            if conclusion_chunk and conclusion_chunk.chunk_index > 2:
                summary_context += f"\n\nConclusion:\n{conclusion_chunk.content}"

            summary_prompt = """Write an extremely concise, evidence-grounded academic summary using only the supplied paper context.
Use this Markdown format:

### ResearchMind Auto Summary:
* **Core Idea**: [One sentence describing the main idea or objective]
* **Contributions**: [One or two lines describing the main scientific contributions]
* **Weaknesses / Limitations**: [One line describing the discussed limitations]

Do not infer contributions or limitations that are absent from the context. Preserve technical terms and numerical results. Write concisely in the output language specified by the system."""

            result = state.generator.generate(
                query=summary_prompt,
                context_text=summary_context,
                task_type="summary",
            )

            if result and result.content:
                session.query(Paper).filter(Paper.id == file_id).update({"auto_summary": result.content})
                session.commit()
                logger.info(f"Generated auto-summary for {doc.filename}")
        except Exception as sum_err:
            logger.warning(f"Auto-summary generation failed for {doc.filename}: {sum_err}")

        session.query(Paper).filter(Paper.id == file_id).update({"status": "indexed"})
        session.commit()
        if state.hybrid and hasattr(state.hybrid, "clear_rerank_cache"):
            state.hybrid.clear_rerank_cache()
        _update_import_job(job_id, status="ready", stage="ready", progress=100, error="")
        logger.info(f"Indexed {doc.filename}: {len(chunks)} chunks")

    except Exception as e:
        logger.error(f"Indexing failed for {doc.filename}: {e}")
        session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
        session.commit()
        _update_import_job(job_id, status="failed", stage="indexing", progress=100, error=str(e))
    finally:
        session.close()


async def _enrich_paper_background(paper_id: str, file_path: str, title: str, authors: list):
    """Chạy ngầm sau khi import — fetch metadata từ OpenAlex + Crossref vào cache."""
    try:
        from academic.cache import cache_set
        from academic.crossref import get_work_by_doi as cr_get
        from academic.doi_extractor import extract_doi_from_paper
        from academic.openalex import get_work_by_doi as oa_get

        doi = await extract_doi_from_paper(pdf_path=file_path, title=title, authors=authors)
        if not doi:
            return

        oa, cr = await asyncio.gather(oa_get(doi), cr_get(doi), return_exceptions=True)

        if isinstance(oa, Exception):
            oa = None
        if isinstance(cr, Exception):
            cr = None

        if oa:
            cache_set(
                f"oa:{doi}",
                "openalex",
                {
                    "openalex_id": oa.openalex_id,
                    "doi": oa.doi,
                    "title": oa.title,
                    "publication_year": oa.publication_year,
                    "citation_count": oa.citation_count,
                    "related_work_ids": oa.related_work_ids,
                    "referenced_work_ids": oa.referenced_work_ids,
                },
            )
        if cr:
            cache_set(
                f"cr:{doi}",
                "crossref",
                {
                    "doi": cr.doi,
                    "title": cr.title,
                    "authors": cr.authors,
                    "journal": cr.journal,
                    "year": cr.year,
                    "publisher": cr.publisher,
                    "citation_count": cr.citation_count,
                    "is_valid": cr.is_valid,
                },
            )

        session = get_session(state.engine)
        try:
            paper = session.query(Paper).filter(Paper.id == paper_id).first()
            if paper:
                paper.doi = paper.doi or doi
                current_authors = _parse_authors(paper.authors)
                if not current_authors and cr and cr.is_valid and cr.authors:
                    paper.authors = json.dumps(clean_authors(cr.authors), ensure_ascii=False)
                authoritative_year = (
                    cr.year if cr and cr.is_valid and cr.year else (oa.publication_year if oa else None)
                )
                if authoritative_year:
                    paper.year = int(authoritative_year)
                # Replace poor local titles with Crossref/OpenAlex when available
                remote_title = None
                if cr and cr.is_valid and getattr(cr, "title", None):
                    remote_title = cr.title
                elif oa and getattr(oa, "title", None):
                    remote_title = oa.title
                if remote_title and (is_poor_title(paper.title) or not paper.title):
                    paper.title = resolve_paper_title(
                        metadata_title=remote_title,
                        filename=paper.filename,
                    )
                session.commit()
        except Exception as db_error:
            session.rollback()
            logger.warning(f"Could not persist enriched metadata for {paper_id}: {db_error}")
        finally:
            session.close()

        logger.info(f"Background enrichment done for {title} (DOI: {doi})")
    except Exception as enrichment_error:
        logger.warning(f"Background metadata enrichment failed for {paper_id}: {enrichment_error}")


def _retry_import_job(job_id: str):
    session = get_session(state.engine)
    try:
        job = session.query(ImportJob).filter(ImportJob.id == job_id).first()
        if not job:
            return
        file_path = job.file_path or job.source_path
        if not file_path or not Path(file_path).exists():
            job.status = "failed"
            job.stage = "retry"
            job.error = t("import.file_not_found_retry")
            job.progress = 100
            job.finished_at = datetime.utcnow()
            session.commit()
            return

        job.status = "parsing"
        job.stage = "parsing"
        job.progress = 20
        job.error = ""
        job.attempts = (job.attempts or 0) + 1
        session.commit()
    finally:
        session.close()

    doc = extract_document(file_path)
    if doc is None:
        _update_import_job(job_id, status="failed", stage="parsing", progress=100, error="Cannot parse document")
        return

    session = get_session(state.engine)
    try:
        job = session.query(ImportJob).filter(ImportJob.id == job_id).first()
        if not job:
            return

        paper = session.query(Paper).filter(Paper.id == job.paper_id).first() if job.paper_id else None
        if not paper:
            paper_id = job.paper_id or str(uuid.uuid4())
            resolved_title = _resolve_doc_title(doc, job.filename)
            paper = Paper(
                id=paper_id,
                filename=job.filename,
                title=resolved_title,
                authors=json.dumps(_parse_authors(doc.authors), ensure_ascii=False),
                year=doc.year,
                doi=doc.doi,
                page_count=doc.page_count,
                file_size=doc.file_size,
                file_path=file_path,
                language=doc.language,
                status="indexing",
                ocr_pages_count=getattr(doc, "ocr_pages_count", 0),
                ocr_pages_failed=getattr(doc, "ocr_pages_failed", 0),
                is_scanned=1 if getattr(doc, "is_scanned", False) else 0,
                layout_stats=json.dumps(getattr(doc, "layout_stats", None) or {}),
            )
            session.add(paper)
            job.paper_id = paper_id
        else:
            session.query(Chunk).filter(Chunk.paper_id == paper.id).delete()
            try:
                state.vector.delete_paper_chunks(paper.id)
            except Exception as e:
                logger.warning(f"ChromaDB delete before retry failed: {e}")
            paper.title = _resolve_doc_title(doc, job.filename)
            paper.authors = json.dumps(_parse_authors(doc.authors), ensure_ascii=False)
            paper.year = doc.year
            paper.doi = doc.doi
            paper.page_count = doc.page_count
            paper.file_size = doc.file_size
            paper.language = doc.language
            paper.status = "indexing"
            paper.ocr_pages_count = getattr(doc, "ocr_pages_count", 0)
            paper.ocr_pages_failed = getattr(doc, "ocr_pages_failed", 0)
            paper.is_scanned = 1 if getattr(doc, "is_scanned", False) else 0
            paper.layout_stats = json.dumps(getattr(doc, "layout_stats", None) or {})

        job.file_path = file_path
        job.status = "indexing"
        job.stage = "indexing"
        job.progress = 40
        job.ocr_pages_count = getattr(doc, "ocr_pages_count", 0)
        job.ocr_pages_failed = getattr(doc, "ocr_pages_failed", 0)
        job.is_scanned = 1 if getattr(doc, "is_scanned", False) else 0
        session.commit()
        paper_id = paper.id
    except Exception as e:
        session.rollback()
        _update_import_job(job_id, status="failed", stage="retry", progress=100, error=str(e))
        return
    finally:
        session.close()

    _index_paper(paper_id, doc, job_id)


def recover_interrupted_import_jobs(
    job_ids: list[str] | None = None,
    stale_after_seconds: float = 0,
) -> int:
    """Resume import jobs left active by a process reload/crash."""
    active_statuses = {"queued", "saved", "parsing", "indexing", "summarizing", "enriching"}
    now = datetime.utcnow()
    session = get_session(state.engine)
    try:
        query = session.query(ImportJob).filter(ImportJob.status.in_(active_statuses))
        if job_ids:
            query = query.filter(ImportJob.id.in_(job_ids))
        jobs = query.all()
        recoverable: list[str] = []
        for job in jobs:
            if stale_after_seconds > 0 and job.updated_at:
                age = (now - job.updated_at).total_seconds()
                if age < stale_after_seconds:
                    continue
            file_path = job.file_path or job.source_path
            if not file_path or not Path(file_path).exists():
                job.status = "failed"
                job.stage = "recovery"
                job.progress = 100
                job.error = "Import file no longer exists after backend restart."
                job.finished_at = now
                continue
            job.status = "queued"
            job.stage = "recovery"
            job.progress = 0
            job.error = ""
            job.finished_at = None
            recoverable.append(job.id)
        session.commit()
    except Exception as exc:
        session.rollback()
        logger.warning(f"Failed to recover interrupted import jobs: {exc}")
        return 0
    finally:
        session.close()

    for job_id in recoverable:
        threading.Thread(target=_retry_import_job, args=(job_id,), daemon=True).start()
    if recoverable:
        logger.info(f"Recovered {len(recoverable)} interrupted import job(s)")
    return len(recoverable)


@jobs_router.get("")
async def list_import_jobs(limit: int = Query(50, ge=1, le=200)):
    session = get_session(state.engine)
    try:
        jobs = session.query(ImportJob).order_by(ImportJob.created_at.desc()).limit(limit).all()
        return {"jobs": [_job_to_dict(job) for job in jobs]}
    finally:
        session.close()


@jobs_router.get("/stream")
async def stream_import_jobs(ids: str = Query(...)):
    job_ids = [job_id.strip() for job_id in ids.split(",") if job_id.strip()]
    if job_ids and getattr(state, "backend_ready", False):
        recover_interrupted_import_jobs(job_ids=job_ids, stale_after_seconds=180)

    async def event_stream():
        if not job_ids:
            yield f"data: {json.dumps({'type': 'done', 'jobs': []})}\n\n"
            return

        last_payload = ""
        for _ in range(180):
            session = get_session(state.engine)
            try:
                jobs = session.query(ImportJob).filter(ImportJob.id.in_(job_ids)).all()
                payload_jobs = [_job_to_dict(job) for job in jobs]
            finally:
                session.close()

            payload = json.dumps({"type": "jobs", "jobs": payload_jobs}, ensure_ascii=False)
            if payload != last_payload:
                last_payload = payload
                yield f"data: {payload}\n\n"

            if payload_jobs and all(
                job["status"] not in {"queued", "saved", "parsing", "indexing", "summarizing", "enriching"}
                for job in payload_jobs
            ):
                yield f"data: {json.dumps({'type': 'done', 'jobs': payload_jobs}, ensure_ascii=False)}\n\n"
                return

            await asyncio.sleep(1.0)

        yield f"data: {json.dumps({'type': 'timeout'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@jobs_router.post("/{job_id}/retry")
async def retry_import_job(job_id: str, background_tasks: BackgroundTasks):
    session = get_session(state.engine)
    try:
        job = session.query(ImportJob).filter(ImportJob.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Import job not found")
        job.status = "queued"
        job.stage = "retry"
        job.progress = 0
        job.error = ""
        job.finished_at = None
        session.commit()
    finally:
        session.close()

    background_tasks.add_task(_retry_import_job, job_id)
    return {"status": "queued", "job_id": job_id}


# ─── Paper CRUD ──────────────────────────────────────────────────


@router.get("")
async def list_papers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    read_status: str = Query(None),
    starred: bool = Query(None),
    collection_id: str = Query(None),
    author: str = Query(None),
    year_from: int = Query(None),
    year_to: int = Query(None),
    tag: str = Query(None),
    q: str = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc"),
):
    """List papers with filtering, sorting, and pagination."""
    session = get_session(state.engine)
    try:
        query = session.query(Paper)
        if status:
            query = query.filter(Paper.status == status)
        if read_status:
            query = query.filter(Paper.read_status == read_status)
        if starred is not None:
            query = query.filter(Paper.starred == (1 if starred else 0))
        if collection_id:
            paper_ids = [
                row.paper_id
                for row in session.query(CollectionPaper.paper_id)
                .filter(CollectionPaper.collection_id == collection_id)
                .all()
            ]
            if not paper_ids:
                return {"total": 0, "page": page, "limit": limit, "papers": []}
            query = query.filter(Paper.id.in_(paper_ids))
        if author:
            query = query.filter(Paper.authors.ilike(f"%{author}%"))
        if year_from:
            query = query.filter(Paper.year >= year_from)
        if year_to:
            query = query.filter(Paper.year <= year_to)
        if tag:
            query = query.filter(Paper.tags.ilike(f"%{tag}%"))
        if q:
            like = f"%{q}%"
            query = query.filter(
                or_(
                    Paper.title.ilike(like),
                    Paper.filename.ilike(like),
                    Paper.authors.ilike(like),
                )
            )

        allowed_sort = {
            "created_at": Paper.created_at,
            "indexed_at": Paper.indexed_at,
            "year": Paper.year,
            "title": Paper.title,
            "filename": Paper.filename,
        }
        sort_col = allowed_sort.get(sort_by, Paper.created_at)
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

        allowed_fields = {"tags", "notes", "read_status", "starred", "title"}
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
        if state.hybrid and hasattr(state.hybrid, "clear_rerank_cache"):
            state.hybrid.clear_rerank_cache()

        return {"status": "deleted", "paper_id": paper_id}
    finally:
        session.close()


@router.post("/{paper_id}/retry-ocr")
async def retry_paper_ocr(paper_id: str, background_tasks: BackgroundTasks):
    """Retry parsing/indexing for a paper, primarily for scanned PDFs that need OCR."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")
        job = ImportJob(
            paper_id=paper.id,
            filename=paper.filename,
            source_path=paper.file_path,
            file_path=paper.file_path,
            status="queued",
            stage="retry_ocr",
            progress=0,
        )
        session.add(job)
        paper.status = "indexing"
        session.commit()
        job_id = job.id
    finally:
        session.close()

    background_tasks.add_task(_retry_import_job, job_id)
    return {"status": "queued", "job_id": job_id, "paper_id": paper_id}


@router.post("/{paper_id}/regenerate-summary")
async def regenerate_summary(paper_id: str):
    """Regenerate the AI summary for a paper on demand."""
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        intro_chunks = (
            session.query(Chunk).filter(Chunk.paper_id == paper_id).order_by(Chunk.chunk_index.asc()).limit(3).all()
        )
        conclusion_chunk = (
            session.query(Chunk).filter(Chunk.paper_id == paper_id).order_by(Chunk.chunk_index.desc()).first()
        )

        if not intro_chunks:
            raise HTTPException(status_code=400, detail="Paper has no indexed chunks yet")

        summary_context = "\n".join([c.content for c in intro_chunks])
        if conclusion_chunk and conclusion_chunk.chunk_index > 2:
            summary_context += f"\n\nConclusion:\n{conclusion_chunk.content}"

        summary_prompt = """Write an extremely concise, evidence-grounded academic summary using only the supplied paper context.
Use this Markdown format:

### ResearchMind Auto Summary:
* **Core Idea**: [One sentence describing the main idea or objective]
* **Contributions**: [One or two lines describing the main scientific contributions]
* **Weaknesses / Limitations**: [One line describing the discussed limitations]

Do not infer contributions or limitations that are absent from the context. Preserve technical terms and numerical results. Write concisely in the output language specified by the system."""

        import asyncio

        result = await asyncio.to_thread(
            state.generator.generate,
            query=summary_prompt,
            context_text=summary_context,
            task_type="summary",
        )

        new_summary = ""
        if result and result.content:
            new_summary = result.content
            paper.auto_summary = new_summary
            paper.auto_summary_lang = settings.output_language or "auto"
            session.commit()
            logger.info(f"Regenerated auto-summary for {paper.filename}")
        else:
            logger.warning(f"Summary generation returned empty for {paper.filename}")

        return {
            "status": "ok",
            "auto_summary": new_summary,
            "auto_summary_lang": paper.auto_summary_lang or "",
        }
    finally:
        session.close()


@router.get("/{paper_id}/file")
async def get_paper_file(paper_id: str):
    """Retrieve the raw document file for a paper (PDF, image, etc.)."""
    from fastapi.responses import FileResponse

    media_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".html": "text/html",
        ".htm": "text/html",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".epub": "application/epub+zip",
    }

    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")
        path = Path(paper.file_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        media_type = media_types.get(path.suffix.lower(), "application/octet-stream")
        return FileResponse(path, media_type=media_type)
    finally:
        session.close()


@router.get("/{paper_id}/viewer")
async def get_paper_viewer(paper_id: str, hl: str = Query(""), page: int = Query(1)):
    """
    Retrieve the PDF with optional temporary highlight annotations.

    Returns the full PDF with yellow highlights applied on-the-fly.
    Highlights are NOT saved — this is a transient view.

    Query params:
        hl: JSON array of {"page": int, "text": str}
        page: Initial page to display (used in #page= fragment)
    """
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")
        path = Path(paper.file_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        highlights: list[dict] = []
        if hl:
            try:
                parsed = json.loads(hl)
                if isinstance(parsed, list):
                    highlights = parsed
            except (json.JSONDecodeError, TypeError):
                logger.warning(f"Invalid hl param for paper {paper_id}: {hl[:100]}")

        pdf_bytes = add_highlights_to_pdf(str(path), highlights)
        media_type = "application/pdf"
        from fastapi.responses import Response

        return Response(
            content=pdf_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'inline; filename="{paper.filename}"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )
    finally:
        session.close()


@router.post("/{paper_id}/save-highlighted-pdf")
async def save_highlighted_pdf_endpoint(paper_id: str, body: dict = Body(...)):
    """
    Permanently save highlighted PDF to disk.

    Generates a new PDF file with highlights applied, saves it
    alongside the original, and creates Annotation records in the database.

    Request body:
        highlights: [{"page": int, "text": str, "note": str (optional)}]
        project_id: str (optional)
    """
    highlights = body.get("highlights") or []
    project_id = body.get("project_id")
    if not highlights:
        raise HTTPException(status_code=400, detail="Missing highlights")

    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        src_path = Path(paper.file_path)
        if not src_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        stem = src_path.stem
        output_path = src_path.with_name(f"{stem}_highlighted.pdf")

        save_highlighted_pdf(src_path, highlights, output_path)

        for hl in highlights:
            page_num = hl.get("page", 1)
            text = hl.get("text", "").strip()
            note = hl.get("note", "").strip()
            if not text:
                continue
            item = Annotation(
                paper_id=paper_id,
                project_id=project_id or None,
                page_number=page_num,
                kind="highlight",
                quote_text=text,
                note=note,
                color="yellow",
                tags="[]",
                position=json.dumps({}),
            )
            session.add(item)

        session.commit()

        filename = output_path.name
        return {
            "status": "saved",
            "file_path": str(output_path),
            "highlights_saved": len(highlights),
            "download_url": f"/api/papers/{paper_id}/file/{filename}",
        }
    except Exception:
        session.rollback()
        raise
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
            related_papers.append(
                {
                    "paper_id": pid,
                    "title": data["title"],
                    "similarity": round(avg_score, 4),
                    "snippet": data["snippet"],
                    "matching_chunks": len(data["scores"]),
                }
            )

        related_papers.sort(key=lambda x: x["similarity"], reverse=True)

        return {
            "related_papers": related_papers[:limit],
            "paper_id": paper_id,
            "model_info": {
                "name": settings.embedding_model,
                "mode": settings.embedding_mode,
            },
        }
    finally:
        session.close()


@router.get("/{paper_id}/related/{other_paper_id}/matches")
async def get_related_paper_matches(paper_id: str, other_paper_id: str, limit: int = Query(10)):
    """
    Get detailed chunk-level matches between a paper and a related paper.
    Returns the matching chunks with content, similarity scores, and page numbers.
    """
    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        other_paper = session.query(Paper).filter(Paper.id == other_paper_id).first()
        if not paper or not other_paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        chunks = session.query(Chunk).filter(Chunk.paper_id == paper_id).order_by(Chunk.chunk_index).all()
        if not chunks:
            return {"matches": [], "paper_id": paper_id, "other_paper_id": other_paper_id}

        # Use the first chunk's embedding to find matches (same logic as find_related_papers)
        chunk_ids = [f"{paper_id}_{chunks[0].chunk_index}"]

        try:
            collection = state.vector.collection
            results = collection.get(
                ids=chunk_ids,
                include=["embeddings"],
            )
            if not results["ids"] or len(results["embeddings"]) == 0:
                return {"matches": [], "paper_id": paper_id, "other_paper_id": other_paper_id}

            query_embedding = results["embeddings"][0]
        except Exception as e:
            logger.warning(f"Failed to get embeddings for paper {paper_id}: {e}")
            return {"matches": [], "paper_id": paper_id, "other_paper_id": other_paper_id}

        # Query with larger n_results to find matches for the specific other paper
        search_results = state.vector.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit * 5,
            include=["metadatas", "distances", "documents"],
        )

        matches = []
        seen_chunk_ids = set()
        if search_results["ids"] and search_results["ids"][0]:
            for i in range(len(search_results["ids"][0])):
                metadata = search_results["metadatas"][0][i]
                distance = search_results["distances"][0][i]
                match_paper_id = metadata.get("paper_id", "")
                chunk_id = search_results["ids"][0][i]

                if match_paper_id != other_paper_id:
                    continue
                if chunk_id in seen_chunk_ids:
                    continue
                seen_chunk_ids.add(chunk_id)

                similarity = 1.0 - distance
                matches.append(
                    {
                        "chunk_id": chunk_id,
                        "paper_id": other_paper_id,
                        "paper_title": metadata.get("paper_title", ""),
                        "content": search_results["documents"][0][i][:500],
                        "page_number": metadata.get("page_number"),
                        "chunk_index": metadata.get("chunk_index"),
                        "similarity": round(similarity, 4),
                    }
                )

                if len(matches) >= limit:
                    break

        matches.sort(key=lambda x: x["similarity"], reverse=True)

        return {
            "matches": matches,
            "paper_id": paper_id,
            "other_paper_id": other_paper_id,
            "other_paper_title": display_title(other_paper.title, other_paper.filename),
            "model_info": {
                "name": settings.embedding_model,
                "mode": settings.embedding_mode,
            },
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

            authors_list = _parse_authors(paper.authors)
            if not authors_list:
                authors_list = ["Unknown"]

            title = display_title(paper.title, paper.filename)
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

                formatted = f'{author_str}, "{title}", {year}'
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
                    cite_key = re.sub(r"[^a-zA-Z0-9_]", "", last_name.lower())[:20]
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
                entry_html_lines.append('<div class="cite-entry">')
                entry_html_lines.append(f'  <span class="cite-num">[{len(citations) + 1}]</span>')
                entry_html_lines.append('  <div class="cite-body">')
                entry_html_lines.append(f'    <span class="cite-authors">{_escape_html(author_display)}</span>')
                entry_html_lines.append(f'    <span class="cite-title">{_escape_html(title)}</span>')
                entry_html_lines.append(f'    <span class="cite-year">({year_str})</span>')
                if pages_str:
                    entry_html_lines.append(f'    <span class="cite-pages">{pages_str}</span>')
                if doi_str:
                    entry_html_lines.append(
                        f'    <span class="cite-doi">DOI: <a href="https://doi.org/{_escape_html(doi_str)}" target="_blank">{_escape_html(doi_str)}</a></span>'
                    )
                entry_html_lines.append("  </div>")
                entry_html_lines.append("</div>")
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

            citations.append(
                {
                    "paper_id": paper.id,
                    "title": title,
                    "authors": authors_list,
                    "year": year,
                    "doi": doi,
                    "pages": pages,
                    "formatted": formatted,
                    "style": style,
                }
            )

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
                "message": t("papers.highlights_not_ready"),
            }

        highlight_prompt = f"""Select up to {limit} high-value passages from the supplied paper excerpts.

Return a JSON array with this structure:
[
  {{
    "category": "key_finding" | "methodology" | "conclusion" | "novel_contribution" | "limitation" | "important_claim",
    "text": "verbatim excerpt, at most 200 characters",
    "page_hint": page number when known, otherwise null,
    "importance": "high" | "medium",
    "note": "brief explanation of why the passage matters, in the user's language"
  }}
]

Categories:
- key_finding: primary research result
- methodology: important method
- conclusion: central conclusion
- novel_contribution: novel contribution or innovation
- limitation: discussed limitation
- important_claim: important concept or claim

Use only verbatim text found in the supplied excerpts. Do not reconstruct or paraphrase the "text" field. Do not invent page numbers. Return a valid JSON array only, with no Markdown fence or additional text."""

        generation = await asyncio.to_thread(
            state.generator.generate,
            query=highlight_prompt,
            context_text=retrieval.context_text,
            task_type="summary",
        )

        highlights = []
        try:
            content = (generation.content or "").strip()
            if content.startswith("```"):
                fences = re.findall(r"```", content)
                if len(fences) >= 2:
                    content = content.split("\n", 1)[-1]
                    content = content.rsplit("```", 1)[0].strip()
                elif len(fences) == 1:
                    content = content.replace("```", "").strip()
            highlights = _parse_highlights_json(content)
        except Exception as parse_err:
            logger.warning(f"Failed to parse highlights JSON: {parse_err}")
            # Never show malformed JSON as a highlight. An empty result lets the
            # UI present its normal retry state without leaking parser details.
            highlights = []

        return {
            "highlights": highlights[:limit],
            "paper_id": paper_id,
            "paper_title": paper.title,
        }
    finally:
        session.close()
