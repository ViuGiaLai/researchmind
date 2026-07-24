"""
ResearchMind VN — Zotero Import Module

Endpoints:
- POST /api/papers/import/bibtex           → Upload .bib file, import papers
- POST /api/papers/import/zotero-csv       → Upload Zotero CSV, import papers
- POST /api/papers/import/zotero-csv-pdf   → Upload CSV + find PDFs from Zotero storage
"""

import csv
import io
import json
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from loguru import logger
from sqlalchemy.orm import Session

from app_state import state
from common.i18n import get_language, t
from config.settings import settings
from db.database import get_session
from db.models import Chunk, Paper
from ingestion.chunker import SentenceSplitter
from ingestion.parser import extract_pdf

router = APIRouter(prefix="/api/papers/import", tags=["Zotero Import"])


# ─── Dependency ─────────────────────────────────────────────────


def _get_db(request: Request):
    engine = request.app.state.engine
    session = get_session(engine)
    try:
        yield session
    finally:
        session.close()


# ─── Helpers ────────────────────────────────────────────────────

LANG_DETECT_RE = re.compile(r"[ăâđêôơưàáãảạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừữửựữỳýỷỹỵ]", re.IGNORECASE)


def _detect_language(text: str) -> str:
    """Simple language detection based on Vietnamese characters."""
    if LANG_DETECT_RE.search(text):
        return "vi"
    return "en"


def _parse_authors(authors_str: str) -> list[str]:
    """Parse author string into a list of names.
    Handles both BibTeX (``and`` separated) and CSV (``;`` separated) formats."""
    if not authors_str or not authors_str.strip():
        return []

    # Try semicolon first (Zotero CSV)
    if ";" in authors_str:
        return [a.strip() for a in authors_str.split(";") if a.strip()]

    # Try " and " (BibTeX)
    if " and " in authors_str:
        authors = []
        for a in authors_str.split(" and "):
            a = a.strip().strip("{}").strip()
            if a:
                authors.append(a)
        return authors

    # Fallback: comma separated
    return [a.strip() for a in authors_str.split(",") if a.strip()]


def _parse_year(year_str: str | None) -> int | None:
    """Extract a 4-digit year from a string."""
    if not year_str:
        return None
    year_str = str(year_str).strip()
    # Direct 4-digit number
    if year_str.isdigit() and len(year_str) == 4:
        return int(year_str)
    # Extract from date string like "2023-05-15" or "2023/05/15"
    match = re.search(r"\b(19|20)\d{2}\b", year_str)
    if match:
        return int(match.group(0))
    return None


def _clean_title(title: str) -> str:
    """Clean and normalize a paper title."""
    if not title:
        return ""
    title = title.strip().strip("{}").strip()
    # Remove surrounding quotes
    title = title.strip("\"'")
    return title


def _find_existing(session: Session, title: str, doi: str) -> Paper | None:
    """Check if a paper already exists by DOI or normalized title."""
    if doi:
        paper = session.query(Paper).filter(Paper.doi == doi).first()
        if paper:
            return paper
    if title and len(title) > 20:
        # Normalize title for comparison
        norm_title = re.sub(r"[^a-z0-9]", "", title.strip().lower())
        # Use ilike to narrow candidates first
        first_words = title.strip().split()[:5]
        like_pattern = "%".join(first_words)
        candidates = session.query(Paper).filter(Paper.title.ilike(f"%{like_pattern}%")).limit(20).all()
        for p in candidates:
            p_norm = re.sub(r"[^a-z0-9]", "", p.title.strip().lower())
            if p_norm == norm_title or (len(norm_title) > 30 and (norm_title in p_norm or p_norm in norm_title)):
                return p
    return None


def _create_paper(
    session: Session,
    title: str,
    authors: str,
    year: int | None,
    doi: str,
    abstract: str,
    tags: str,
    journal: str = "",
    pages: int | None = None,
    language: str = "unknown",
) -> tuple[Paper | None, bool]:
    """Create a Paper entry in the database.
    Returns (paper, is_new) tuple. is_new=False means paper already existed."""
    # Check for duplicates
    existing = _find_existing(session, title, doi)
    if existing:
        return existing, False

    file_id = str(uuid.uuid4())

    try:
        paper = Paper(
            id=file_id,
            filename=f"{file_id}.pdf",
            title=title,
            authors=authors,
            year=year,
            doi=doi,
            abstract=abstract,
            language=language,
            page_count=pages,
            file_size=0,
            file_path="",
            status="indexed",
            tags=tags,
            notes="",
            auto_summary="",
            read_status="unread",
            starred=0,
        )
        session.add(paper)
        session.commit()
        return paper, True
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create paper: {e}")
        return None, False


# ─── BibTeX Parser ──────────────────────────────────────────────


def _extract_braced_value(text: str, start: int) -> tuple[str, int]:
    """Extract a brace-delimited value starting at position `start` (the '{' character).
    Handles nested braces correctly.
    Returns (value, end_position_after_closing_brace)."""
    depth = 0
    i = start
    result = []
    while i < len(text):
        ch = text[i]
        if ch == "{":
            if depth > 0:
                result.append(ch)
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return "".join(result), i + 1
            result.append(ch)
        else:
            if depth > 0:
                result.append(ch)
        i += 1
    # If we reach here, braces are unbalanced — return what we have
    return "".join(result), i


def _parse_bibtex(content: str) -> list[dict]:
    """Parse BibTeX file content and return a list of paper dicts.
    Handles nested braces and edge cases."""
    papers = []

    # Find all @entrytype{citekey, ... }
    # Use a robust approach: locate entry starts and manually extract
    entry_starts = list(re.finditer(r"@(\w+)\s*\{\s*([^,{}\s]+)\s*,", content, re.IGNORECASE))

    for i, entry_match in enumerate(entry_starts):
        entry_type = entry_match.group(1).lower()
        cite_key = entry_match.group(2).strip()

        # Find the opening brace after the citekey
        body_start = entry_match.end()
        # Find the matching closing brace
        body_text, body_end = _extract_braced_value(content, body_start)

        if not body_text:
            continue

        # Parse fields: field = {value} or field = "value"
        fields = {}
        field_pattern = re.compile(r"(\w+)\s*=", re.DOTALL)
        for fm in field_pattern.finditer(body_text):
            key = fm.group(1).lower()
            # Find the value after =
            val_start = fm.end()
            # Skip whitespace
            while val_start < len(body_text) and body_text[val_start] in " \t\n\r":
                val_start += 1
            if val_start >= len(body_text):
                continue
            if body_text[val_start] == "{":
                value, _ = _extract_braced_value(body_text, val_start)
            elif body_text[val_start] == '"':
                # Quoted string
                end = body_text.find('"', val_start + 1)
                if end == -1:
                    end = len(body_text)
                value = body_text[val_start + 1 : end]
            else:
                # Unquoted value until comma or end
                end = val_start
                while end < len(body_text) and body_text[end] not in ",}\n":
                    end += 1
                value = body_text[val_start:end].strip()
            fields[key] = value.strip()

        # Map BibTeX fields to our schema
        title = _clean_title(fields.get("title", ""))
        if not title:
            continue

        authors_raw = fields.get("author", "")
        authors_list = _parse_authors(authors_raw)
        authors_json = json.dumps(authors_list, ensure_ascii=False)

        year = _parse_year(fields.get("year", ""))
        doi = fields.get("doi", "")

        # Abstract
        abstract = fields.get("abstract", "")
        # Remove curly braces from abstract
        abstract = abstract.strip("{}").strip()

        # Journal / Booktitle
        journal = fields.get("journal", "") or fields.get("booktitle", "")

        # Pages
        pages_str = fields.get("pages", "")
        pages = None
        if pages_str:
            # Extract last number from range like "1-15" or "15"
            page_match = re.search(r"(\d+)$", pages_str)
            if page_match:
                pages = int(page_match.group(1))

        # Tags from entry type + keywords
        tags_list = [entry_type]
        keywords = fields.get("keywords", "")
        if keywords:
            kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
            tags_list.extend(kw_list)

        # Language detection
        lang = _detect_language(f"{title} {abstract}")

        papers.append(
            {
                "title": title,
                "authors": authors_json,
                "year": year,
                "doi": doi,
                "abstract": abstract,
                "journal": journal,
                "pages": pages,
                "language": lang,
                "tags": json.dumps(tags_list, ensure_ascii=False),
                "source": "bibtex",
                "cite_key": cite_key,
            }
        )

    return papers


# ─── Zotero CSV Parser ──────────────────────────────────────────

# Zotero CSV column headers (standard export)
ZOTERO_CSV_FIELDS = {
    "key": "key",
    "item type": "item_type",
    "publication year": "year",
    "author": "author",
    "title": "title",
    "publication title": "publication",
    "isbn": "isbn",
    "issn": "issn",
    "doi": "doi",
    "url": "url",
    "abstract note": "abstract",
    "date": "date",
    "date added": "date_added",
    "date modified": "date_modified",
    "pages": "pages",
    "num pages": "num_pages",
    "issue": "issue",
    "volume": "volume",
    "number of volumes": "num_volumes",
    "journal abbreviation": "journal_abbr",
    "short title": "short_title",
    "series": "series",
    "series title": "series_title",
    "publisher": "publisher",
    "place": "place",
    "language": "language",
    "rights": "rights",
    "type": "type",
    "archive": "archive",
    "archive location": "archive_location",
    "library catalog": "library_catalog",
    "call number": "call_number",
    "extra": "extra",
    "notes": "notes",
    "manual tags": "manual_tags",
    "automatic tags": "automatic_tags",
    "editor": "editor",
    "series editor": "series_editor",
    "translator": "translator",
    "contributor": "contributor",
}


def _parse_zotero_csv(content: str) -> list[dict]:
    """Parse Zotero CSV content and return a list of paper dicts."""
    reader = csv.DictReader(io.StringIO(content))
    papers = []

    for row in reader:
        title = _clean_title(row.get("Title", row.get("title", "")))
        if not title:
            continue

        author_raw = row.get("Author", row.get("author", ""))
        authors_list = _parse_authors(author_raw)
        authors_json = json.dumps(authors_list, ensure_ascii=False)

        year = _parse_year(row.get("Publication Year", row.get("publication year", "")))
        doi = row.get("DOI", row.get("doi", ""))
        abstract = row.get("Abstract Note", row.get("abstract note", ""))
        pages_str = row.get("Pages", row.get("pages", ""))
        item_type = row.get("Item Type", row.get("item type", "")).lower()

        # Pages
        pages = None
        if pages_str:
            page_match = re.search(r"(\d+)$", pages_str)
            if page_match:
                pages = int(page_match.group(1))

        # Tags
        tags_list = [item_type] if item_type else []
        manual_tags = row.get("Manual Tags", row.get("manual tags", ""))
        auto_tags = row.get("Automatic Tags", row.get("automatic tags", ""))
        for tag_str in [manual_tags, auto_tags]:
            if tag_str:
                tags_list.extend([t.strip() for t in tag_str.split(";") if t.strip()])
        tags_json = json.dumps(tags_list, ensure_ascii=False)

        # Language
        lang = row.get("Language", row.get("language", "")).strip().lower()
        if not lang:
            lang = _detect_language(f"{title} {abstract}")

        papers.append(
            {
                "title": title,
                "authors": authors_json,
                "year": year,
                "doi": doi,
                "abstract": abstract,
                "journal": row.get("Publication Title", row.get("publication title", "")),
                "pages": pages,
                "language": lang,
                "tags": tags_json,
                "source": "zotero_csv",
                "file_attachments": row.get("File Attachments", row.get("file attachments", "")),
            }
        )

    return papers


# ─── PDF Finder from Zotero Storage ─────────────────────────────


def _parse_zotero_attachment_path(attachment_str: str) -> list[dict]:
    r"""
    Parse Zotero "File Attachments" column value.
    Returns a list of dicts with keys: type, path, filename, is_pdf.

    Examples:
      - "storage:ABCDEFGH\file.pdf"
      - "attachments:ABCDEFGH\file.pdf"
      - "C:\\Users\\user\\Zotero\\storage\\ABCDEFGH\\file.pdf"
      - "http://example.com/paper.pdf"  (URL — skip)
      - "storage:IJKLMNOP\chapter1.pdf; storage:QRSTUVWX\chapter2.pdf"
    """
    results = []
    if not attachment_str or not attachment_str.strip():
        return results

    # Split by semicolon for multiple attachments
    parts = [p.strip() for p in attachment_str.split(";") if p.strip()]

    for part in parts:
        # Skip empty or very long (likely URLs)
        if not part or len(part) > 500:
            continue

        entry = {
            "raw": part,
            "type": "unknown",
            "storage_hash": "",
            "filename": "",
            "is_pdf": False,
            "full_path": "",
        }

        # Pattern 1: storage:HASH\filename.ext
        storage_match = re.match(r"^storage:([^\\/]+)\\(.+)$", part, re.IGNORECASE)
        if storage_match:
            entry["type"] = "storage"
            entry["storage_hash"] = storage_match.group(1).strip()
            entry["filename"] = storage_match.group(2).strip()
            entry["is_pdf"] = entry["filename"].lower().endswith(".pdf")
            results.append(entry)
            continue

        # Pattern 2: attachments:HASH\filename.ext
        att_match = re.match(r"^attachments:([^\\/]+)\\(.+)$", part, re.IGNORECASE)
        if att_match:
            entry["type"] = "attachments"
            entry["storage_hash"] = att_match.group(1).strip()
            entry["filename"] = att_match.group(2).strip()
            entry["is_pdf"] = entry["filename"].lower().endswith(".pdf")
            results.append(entry)
            continue

        # Pattern 3: Full absolute path
        path_obj = Path(part)
        if path_obj.exists():
            entry["type"] = "absolute"
            entry["full_path"] = str(path_obj.resolve())
            entry["filename"] = path_obj.name
            entry["is_pdf"] = path_obj.suffix.lower() == ".pdf"
            results.append(entry)
            continue

        # Pattern 4: Maybe just a hash? (rare, but Zotero can export just the hash)
        hash_match = re.match(r"^([A-Fa-f0-9]{8,32})\\(.+)$", part)
        if hash_match:
            entry["type"] = "storage"
            entry["storage_hash"] = hash_match.group(1).strip()
            entry["filename"] = hash_match.group(2).strip()
            entry["is_pdf"] = entry["filename"].lower().endswith(".pdf")
            results.append(entry)
            continue

        # Pattern 5: filename only (no path) — skip, can't locate
        if part.lower().endswith(".pdf"):
            entry["type"] = "filename_only"
            entry["filename"] = part
            entry["is_pdf"] = True
            results.append(entry)
            continue

    return results


def _locate_pdf_from_attachment(
    attachment: dict,
    zotero_data_dir: str | None = None,
) -> str | None:
    """
    Try to find the actual PDF file on disk from an attachment entry.
    Returns the absolute path to the PDF if found, None otherwise.
    """
    # If it's an absolute path that exists, use it directly
    if attachment.get("full_path"):
        path = Path(attachment["full_path"])
        if path.exists():
            return str(path.resolve())

    # If we need Zotero storage directory
    if attachment.get("storage_hash") and zotero_data_dir:
        zotero_storage = Path(zotero_data_dir) / "storage"
        if not zotero_storage.exists():
            logger.warning(f"Zotero storage dir not found: {zotero_storage}")
            return None

        # Try multiple possible locations
        hash_val = attachment["storage_hash"]
        filename = attachment["filename"]

        # Direct: {zotero_data_dir}/storage/{hash}/{filename}
        candidates = [
            zotero_storage / hash_val / filename,
            # Sometimes Zotero stores without subdirectory
            zotero_storage / filename,
            # Deep nested (rare but possible)
            zotero_storage / hash_val[:2] / hash_val / filename,
            zotero_storage / hash_val[:2] / hash_val[2:4] / hash_val / filename,
        ]

        # Also try to find any PDF in the hash directory
        hash_dir = zotero_storage / hash_val
        if hash_dir.exists() and hash_dir.is_dir():
            for f in hash_dir.iterdir():
                if f.suffix.lower() == ".pdf":
                    candidates.append(str(f.resolve()))

        for candidate in candidates:
            p = Path(candidate) if isinstance(candidate, str) else candidate
            if p.exists():
                return str(p.resolve())

    return None


def _copy_and_index_pdf(
    pdf_path: str,
    paper_id: str,
    title: str,
    background_tasks: BackgroundTasks,
    lang: str = "vi",
) -> dict:
    """
    Copy a PDF from Zotero storage to the app's papers directory,
    update the paper's file fields, and trigger background indexing.

    Returns dict with status info.
    """
    from db.database import get_session as _get_db_session

    src = Path(pdf_path)
    if not src.exists():
        return {"status": "error", "error": f"PDF file not found: {pdf_path}"}

    # Copy to papers_dir
    safe_filename = f"{paper_id}_{src.name}"
    dest = settings.papers_dir / safe_filename

    try:
        shutil.copy2(str(src), str(dest))
        logger.info(f"Copied PDF from Zotero: {src.name} → {dest.name}")
    except Exception as e:
        logger.error(f"Failed to copy PDF: {e}")
        return {"status": "error", "error": t("import.pdf_copy_fail", lang, error=str(e))}

    # Parse PDF to extract text and metadata
    doc = extract_pdf(str(dest))
    if doc is None:
        logger.warning(f"Could not parse PDF: {pdf_path}")
        session = _get_db_session(state.engine)  # noqa: F821 — state from main.py
        try:
            session.query(Paper).filter(Paper.id == paper_id).update(
                {
                    "file_path": str(dest),
                    "file_size": src.stat().st_size,
                    "status": "pending",
                }
            )
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()
        return {"status": "warning", "error": t("import.pdf_parse_fail", lang)}

    # Update paper with extracted data
    session = _get_db_session(state.engine)  # noqa: F821
    try:
        session.query(Paper).filter(Paper.id == paper_id).update(
            {
                "file_path": str(dest),
                "file_size": doc.file_size or src.stat().st_size,
                "page_count": doc.page_count,
                "language": doc.language,
                "status": "indexing",
            }
        )
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to update paper after PDF copy: {e}")
        return {"status": "error", "error": t("import.db_save_error", lang, error=str(e))}
    finally:
        session.close()

    # Schedule background indexing (chunk + embed)
    background_tasks.add_task(_index_paper_from_zotero, paper_id, title, doc)

    return {"status": "indexing", "page_count": doc.page_count}


def _index_paper_from_zotero(file_id: str, title: str, doc):
    """
    Background indexing for Zotero-imported paper (same as main.py's _index_paper).
    Chunk → embed → store in ChromaDB + FTS5.
    """
    logger.info(f"Indexing Zotero paper: {file_id} ({title})")

    from db.database import get_session as _get_db_session

    session = _get_db_session(state.engine)  # noqa: F821
    try:
        # Chunk
        splitter = SentenceSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        chunks = splitter.chunk_text(doc.text_by_page)

        if not chunks:
            logger.warning(f"No chunks for {title}")
            session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
            session.commit()
            return

        logger.info(f"Generated {len(chunks)} chunks for {title}")

        # Save chunks to SQLite
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

        # Rebuild FTS
        try:
            state.bm25._rebuild_fts()  # noqa: F821
        except Exception as e:
            logger.warning(f"FTS rebuild failed: {e}")

        # Embed and store in ChromaDB
        chunk_texts = [c.text for c in chunks]
        chunk_ids = [f"{file_id}_{c.index}" for c in chunks]
        metadatas = [
            {
                "paper_id": file_id,
                "paper_title": title,
                "chunk_index": c.index,
                "page_number": c.page_number or 0,
                "section_header": c.section_header or "",
            }
            for c in chunks
        ]

        embeddings = state.embedder.embed(chunk_texts)  # noqa: F821
        state.vector.add_chunks(chunk_ids, embeddings, metadatas, chunk_texts)  # noqa: F821

        # Update status
        session.query(Paper).filter(Paper.id == file_id).update({"status": "indexed"})
        session.commit()

        logger.info(f"✅ Indexed Zotero paper: {title} — {len(chunks)} chunks")

    except Exception as e:
        logger.error(f"Zotero indexing failed for {title}: {e}")
        try:
            session.query(Paper).filter(Paper.id == file_id).update({"status": "failed"})
            session.commit()
        except Exception:
            pass
    finally:
        session.close()


# ─── Endpoints ──────────────────────────────────────────────────


@router.post("/bibtex")
async def import_bibtex(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(_get_db),
):
    """Import papers from a BibTeX (.bib) file."""
    lang = get_language(request)
    if not file.filename.lower().endswith(".bib"):
        raise HTTPException(
            status_code=400,
            detail=t("import.bib_only", lang),
        )

    content = await file.read()
    try:
        text_content = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text_content = content.decode("latin-1")
        except Exception:
            raise HTTPException(status_code=400, detail=t("import.bib_read_fail", lang))

    papers_data = _parse_bibtex(text_content)

    if not papers_data:
        raise HTTPException(
            status_code=400,
            detail=t("import.bib_no_entries", lang),
        )

    results = []
    for p in papers_data:
        paper, is_new = _create_paper(
            session=db,
            title=p["title"],
            authors=p["authors"],
            year=p["year"],
            doi=p["doi"],
            abstract=p["abstract"],
            tags=p["tags"],
            journal=p.get("journal", ""),
            pages=p.get("pages"),
            language=p.get("language", "unknown"),
        )
        if paper:
            status = "imported" if is_new else "duplicate"
            results.append(
                {
                    "filename": f"{p['cite_key']}.bib",
                    "status": status,
                    "paper_id": paper.id,
                    "title": p["title"],
                }
            )
        else:
            results.append(
                {
                    "filename": f"{p['cite_key']}.bib",
                    "status": "error",
                    "error": t("import.db_save_error", lang),
                    "title": p["title"],
                }
            )

    imported_count = len([r for r in results if r["status"] == "imported"])
    duplicate_count = len([r for r in results if r["status"] == "duplicate"])
    error_count = len([r for r in results if r["status"] == "error"])

    return {
        "total": len(papers_data),
        "imported": imported_count,
        "duplicates": duplicate_count,
        "errors": error_count,
        "results": results,
    }


@router.post("/zotero-csv")
async def import_zotero_csv(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(_get_db),
):
    """Import papers from a Zotero CSV export file (metadata only, no PDF)."""
    lang = get_language(request)
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail=t("import.csv_only", lang),
        )

    content = await file.read()
    try:
        text_content = content.decode("utf-8-sig")  # Handle BOM
    except UnicodeDecodeError:
        try:
            text_content = content.decode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail=t("import.csv_read_fail", lang))

    papers_data = _parse_zotero_csv(text_content)

    if not papers_data:
        raise HTTPException(
            status_code=400,
            detail=t("import.csv_no_data", lang),
        )

    results = []
    for p in papers_data:
        paper, is_new = _create_paper(
            session=db,
            title=p["title"],
            authors=p["authors"],
            year=p["year"],
            doi=p["doi"],
            abstract=p["abstract"],
            tags=p["tags"],
            journal=p.get("journal", ""),
            pages=p.get("pages"),
            language=p.get("language", "unknown"),
        )
        if paper:
            status = "imported" if is_new else "duplicate"
            results.append(
                {
                    "filename": p.get("title", "unknown")[:50],
                    "status": status,
                    "paper_id": paper.id,
                    "title": p["title"],
                }
            )
        else:
            results.append(
                {
                    "filename": p.get("title", "unknown")[:50],
                    "status": "error",
                    "error": t("import.db_save_error", lang),
                    "title": p["title"],
                }
            )

    imported_count = len([r for r in results if r["status"] == "imported"])
    duplicate_count = len([r for r in results if r["status"] == "duplicate"])
    error_count = len([r for r in results if r["status"] == "error"])

    return {
        "total": len(papers_data),
        "imported": imported_count,
        "duplicates": duplicate_count,
        "errors": error_count,
        "results": results,
    }


@router.post("/zotero-csv-pdf")
async def import_zotero_csv_with_pdfs(
    request: Request,
    file: UploadFile = File(...),
    zotero_data_dir: str = Form(default=""),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(_get_db),
):
    r"""
    Import papers from Zotero CSV + tự động tìm và index PDF từ Zotero storage.

    - file: File .csv export từ Zotero
    - zotero_data_dir: Đường dẫn thư mục Zotero data (VD: C:\Users\name\Zotero)
      Nếu để trống, chỉ import metadata.
    """
    lang = get_language(request)
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail=t("import.csv_only", lang),
        )

    content = await file.read()
    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text_content = content.decode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail=t("import.csv_read_fail", lang))

    papers_data = _parse_zotero_csv(text_content)

    if not papers_data:
        raise HTTPException(
            status_code=400,
            detail=t("import.csv_no_data", lang),
        )

    # Resolve Zotero data directory
    zotero_path = None
    if zotero_data_dir and zotero_data_dir.strip():
        z_path = Path(zotero_data_dir.strip())
        if z_path.exists() and (z_path / "storage").exists():
            zotero_path = z_path
        else:
            logger.warning(f"Zotero data dir invalid or missing storage/: {zotero_data_dir}")

    results = []
    for p in papers_data:
        # Create metadata entry first
        paper, is_new = _create_paper(
            session=db,
            title=p["title"],
            authors=p["authors"],
            year=p["year"],
            doi=p["doi"],
            abstract=p["abstract"],
            tags=p["tags"],
            journal=p.get("journal", ""),
            pages=p.get("pages"),
            language=p.get("language", "unknown"),
        )

        if not paper:
            results.append(
                {
                    "filename": p.get("title", "unknown")[:50],
                    "status": "error",
                    "error": t("import.db_save_error", lang),
                    "title": p["title"],
                }
            )
            continue

        result = {
            "filename": p.get("title", "unknown")[:50],
            "paper_id": paper.id,
            "title": p["title"],
            "status": "duplicate" if not is_new else "imported",
            "pdf_status": "none",
        }

        # Try to find and import PDF if Zotero data dir is provided
        if zotero_path and p.get("file_attachments"):
            attachments = _parse_zotero_attachment_path(p["file_attachments"])
            pdf_found = False

            for att in attachments:
                if not att["is_pdf"]:
                    continue

                pdf_path = _locate_pdf_from_attachment(att, str(zotero_path))
                if pdf_path:
                    # Copy and index the PDF in background
                    pdf_result = _copy_and_index_pdf(
                        pdf_path=str(pdf_path),
                        paper_id=paper.id,
                        title=p["title"],
                        background_tasks=background_tasks,
                        lang=lang,
                    )

                    if pdf_result["status"] == "indexing":
                        result["pdf_status"] = "indexing"
                        result["page_count"] = pdf_result.get("page_count", 0)
                    elif pdf_result["status"] == "error":
                        result["pdf_status"] = "error"
                        result["pdf_error"] = pdf_result.get("error", "")
                    else:
                        result["pdf_status"] = pdf_result["status"]

                    pdf_found = True
                    break  # Use first matching PDF

            if not pdf_found and attachments:
                result["pdf_status"] = "not_found"
                result["pdf_error"] = t("import.pdf_not_found", lang)

        results.append(result)

    imported_count = len([r for r in results if r["status"] == "imported"])
    duplicate_count = len([r for r in results if r["status"] == "duplicate"])
    error_count = len([r for r in results if r["status"] == "error"])
    pdf_imported = len([r for r in results if r.get("pdf_status") == "indexing"])
    pdf_not_found = len([r for r in results if r.get("pdf_status") == "not_found"])

    return {
        "total": len(papers_data),
        "imported": imported_count,
        "duplicates": duplicate_count,
        "errors": error_count,
        "pdf_imported": pdf_imported,
        "pdf_not_found": pdf_not_found,
        "results": results,
    }


@router.post("/zotero-sqlite-sync")
async def import_zotero_sqlite_sync(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(_get_db),
):
    """
    Automatically scan the local zotero.sqlite file,
    identify new papers, and import/index them with their PDFs.
    """
    import sqlite3

    lang = get_language(request)
    zotero_dir_str = settings.zotero_data_dir
    if not zotero_dir_str or not zotero_dir_str.strip():
        raise HTTPException(
            status_code=400,
            detail=t("import.zotero_not_configured", lang),
        )

    zotero_dir = Path(zotero_dir_str.strip())
    sqlite_path = zotero_dir / "zotero.sqlite"
    if not sqlite_path.exists():
        raise HTTPException(
            status_code=400,
            detail=t("import.zotero_sqlite_not_found", lang, path=sqlite_path),
        )

    try:
        conn = sqlite3.connect(str(sqlite_path))
        cursor = conn.cursor()

        # Query main items
        query = """
        SELECT
            i.itemId,
            i.key,
            t.typeName,
            (SELECT value FROM itemDataValues idv JOIN itemData id ON id.valueId = idv.valueId JOIN fields f ON id.fieldId = f.fieldId WHERE id.itemId = i.itemId AND f.fieldName = 'title') as title,
            (SELECT value FROM itemDataValues idv JOIN itemData id ON id.valueId = idv.valueId JOIN fields f ON id.fieldId = f.fieldId WHERE id.itemId = i.itemId AND f.fieldName = 'abstractNote') as abstract,
            (SELECT value FROM itemDataValues idv JOIN itemData id ON id.valueId = idv.valueId JOIN fields f ON id.fieldId = f.fieldId WHERE id.itemId = i.itemId AND f.fieldName = 'date') as date,
            (SELECT value FROM itemDataValues idv JOIN itemData id ON id.valueId = idv.valueId JOIN fields f ON id.fieldId = f.fieldId WHERE id.itemId = i.itemId AND f.fieldName = 'DOI') as doi,
            (SELECT value FROM itemDataValues idv JOIN itemData id ON id.valueId = idv.valueId JOIN fields f ON id.fieldId = f.fieldId WHERE id.itemId = i.itemId AND f.fieldName = 'publicationTitle') as journal,
            (SELECT value FROM itemDataValues idv JOIN itemData id ON id.valueId = idv.valueId JOIN fields f ON id.fieldId = f.fieldId WHERE id.itemId = i.itemId AND f.fieldName = 'pages') as pages
        FROM items i
        JOIN itemTypes t ON i.itemTypeId = t.itemTypeId
        WHERE t.typeName NOT IN ('attachment', 'note', 'annotation')
        """
        cursor.execute(query)
        rows = cursor.fetchall()

        synced_count = 0
        duplicate_count = 0
        error_count = 0
        pdf_imported = 0
        results = []

        for row in rows:
            item_id, key, type_name, title, abstract, date_str, doi, journal, pages = row
            if not title:
                continue

            title = _clean_title(title)

            # Get authors
            creators_query = """
            SELECT c.lastName, c.firstName
            FROM itemCreators ic
            JOIN creators c ON ic.creatorId = c.creatorId
            WHERE ic.itemId = ?
            ORDER BY ic.orderIndex
            """
            cursor.execute(creators_query, (item_id,))
            authors_list = []
            for c_row in cursor.fetchall():
                last, first = c_row
                name = f"{first} {last}".strip() if first else last
                if name:
                    authors_list.append(name)
            authors_json = json.dumps(authors_list, ensure_ascii=False)

            # Get attachments
            attachments_query = """
            SELECT path
            FROM itemAttachments
            WHERE parentItemId = ? AND (path LIKE 'storage:%' OR path LIKE '%.pdf')
            """
            cursor.execute(attachments_query, (item_id,))
            attachments = [r[0] for r in cursor.fetchall() if r[0]]

            year = _parse_year(date_str)
            lang = _detect_language(f"{title} {abstract or ''}")

            tags_list = [type_name.lower()]
            tags_json = json.dumps(tags_list, ensure_ascii=False)

            # Check if paper already exists
            existing = _find_existing(db, title, doi or "")
            if existing:
                duplicate_count += 1
                results.append({"title": title, "status": "duplicate", "paper_id": existing.id})
                continue

            # Create paper entry
            paper, is_new = _create_paper(
                session=db,
                title=title,
                authors=authors_json,
                year=year,
                doi=doi or "",
                abstract=abstract or "",
                tags=tags_json,
                journal=journal or "",
                pages=None,
                language=lang,
            )

            if not paper:
                error_count += 1
                results.append({"title": title, "status": "error", "error": t("import.db_save_error", lang)})
                continue

            result = {"title": title, "paper_id": paper.id, "status": "imported", "pdf_status": "none"}

            # Try to copy PDF if exists
            pdf_found = False
            for att_path in attachments:
                storage_match = re.match(r"^storage:([^\\/]+)[\\/](.+)$", att_path, re.IGNORECASE)
                if storage_match:
                    storage_hash = storage_match.group(1).strip()
                    filename = storage_match.group(2).strip()
                    if filename.lower().endswith(".pdf"):
                        att = {"storage_hash": storage_hash, "filename": filename, "is_pdf": True}
                        pdf_path = _locate_pdf_from_attachment(att, str(zotero_dir))
                        if pdf_path:
                            pdf_result = _copy_and_index_pdf(
                                pdf_path=str(pdf_path),
                                paper_id=paper.id,
                                title=title,
                                background_tasks=background_tasks,
                                lang=lang,
                            )
                            if pdf_result["status"] == "indexing":
                                result["pdf_status"] = "indexing"
                                pdf_imported += 1
                            else:
                                result["pdf_status"] = pdf_result["status"]
                            pdf_found = True
                            break

            if not pdf_found and attachments:
                result["pdf_status"] = "not_found"

            synced_count += 1
            results.append(result)

        conn.close()

        return {
            "total": len(rows),
            "imported": synced_count,
            "duplicates": duplicate_count,
            "errors": error_count,
            "pdf_imported": pdf_imported,
            "results": results[:100],
        }
    except Exception as e:
        logger.error(f"Zotero SQLite sync failed: {e}")
        raise HTTPException(status_code=500, detail=t("import.zotero_sync_fail", lang, error=str(e)))
