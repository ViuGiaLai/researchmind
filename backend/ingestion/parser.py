import fitz  # PyMuPDF
import re
from pathlib import Path
from typing import Optional
from dataclasses import dataclass
from loguru import logger

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md", ".html", ".htm", ".epub"}


@dataclass
class ExtractedDocument:
    path: str
    filename: str
    title: str
    authors: str  # JSON array string
    year: Optional[int]
    doi: str
    page_count: int
    file_size: int
    language: str
    text_by_page: dict[int, str]  # page_number -> text
    full_text: str


def extract_document(file_path: str) -> Optional[ExtractedDocument]:
    path = Path(file_path)
    if not path.exists():
        return None

    ext = path.suffix.lower()
    if ext == ".pdf":
        return _extract_pdf(file_path)
    elif ext in (".docx", ".doc"):
        return _extract_docx(file_path)
    elif ext == ".txt":
        return _extract_txt(file_path)
    elif ext == ".md":
        return _extract_markdown(file_path)
    elif ext in (".html", ".htm"):
        return _extract_html(file_path)
    elif ext == ".epub":
        return _extract_epub(file_path)
    return None


def extract_pdf(file_path: str) -> Optional[ExtractedDocument]:
    return _extract_pdf(file_path)


def _extract_pdf(file_path: str) -> Optional[ExtractedDocument]:
    path = Path(file_path)

    try:
        doc = fitz.open(file_path)
    except Exception:
        return None

    text_by_page: dict[int, str] = {}
    full_text_parts: list[str] = []

    ocr_engine = None

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")
        bad_chars = sum(1 for c in text if ord(c) < 0x09 or 0x0E <= ord(c) < 0x20 or 0x80 <= ord(c) < 0xA0)
        is_garbled = bad_chars > max(3, len(text.strip()) * 0.05)
        if is_garbled and len(text.strip()) > 0:
            text_html = page.get_text("html")
            if text_html:
                html_text = re.sub(r'<[^>]+>', ' ', text_html)
                html_bad = sum(1 for c in html_text if ord(c) < 0x09 or 0x0E <= ord(c) < 0x20 or 0x80 <= ord(c) < 0xA0)
                if html_bad < bad_chars:
                    text = html_text
                    is_garbled = False
        if is_garbled or len(text.strip()) < 40:
            try:
                logger.info(f"Page {page_num + 1} appears to be a scanned page (text length: {len(text.strip())}). Running OCR...")
                if ocr_engine is None:
                    from rapidocr_onnxruntime import RapidOCR
                    ocr_engine = RapidOCR()
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                ocr_results, elapse = ocr_engine(img_bytes)
                if ocr_results:
                    ocr_text_list = [res[1] for res in ocr_results if res and len(res) > 1]
                    ocr_text = "\n".join(ocr_text_list)
                    if ocr_text.strip():
                        text = ocr_text
                        logger.info(f"Page {page_num + 1} OCR completed in {elapse:.2f}s")
            except Exception as e:
                logger.warning(f"OCR failed for page {page_num + 1}: {e}")

        text_by_page[page_num + 1] = text
        full_text_parts.append(text)

    full_text = "\n".join(full_text_parts)

    meta = doc.metadata or {}
    title = meta.get("title", "").strip() or path.stem
    authors_raw = meta.get("author", "").strip()
    authors_list = [a.strip() for a in authors_raw.split(";") if a.strip()] if authors_raw else []
    authors_json = str(authors_list)

    year = None
    year_str = meta.get("creationDate", "")
    if year_str and len(year_str) >= 4:
        try:
            year = int(year_str[:4])
        except ValueError:
            pass
    if not year:
        years_found = re.findall(r"\b(19|20)\d{2}\b", path.stem)
        if years_found:
            year = int(years_found[0])

    doi = meta.get("identifier", "").strip() or ""
    language = _detect_language(full_text[:2000])

    doc.close()

    return ExtractedDocument(
        path=str(path.absolute()),
        filename=path.name,
        title=title,
        authors=authors_json,
        year=year,
        doi=doi,
        page_count=len(text_by_page),
        file_size=path.stat().st_size,
        language=language,
        text_by_page=text_by_page,
        full_text=full_text,
    )


def _extract_docx(file_path: str) -> Optional[ExtractedDocument]:
    try:
        from docx import Document as DocxDocument
    except ImportError:
        logger.error("python-docx not installed")
        return None

    path = Path(file_path)
    try:
        doc = DocxDocument(file_path)
    except Exception as e:
        logger.error(f"Failed to parse DOCX {file_path}: {e}")
        return None

    paragraphs = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)

    full_text = "\n".join(paragraphs)
    if not full_text.strip():
        return None

    # Try to get title from first heading or first line
    title = path.stem
    for para in doc.paragraphs:
        if para.style.name.startswith("Heading") and para.text.strip():
            title = para.text.strip()
            break
    if title == path.stem and paragraphs:
        title = paragraphs[0]

    authors_list = []
    author_para = None
    for para in doc.paragraphs:
        if para.text.strip().lower().startswith("author"):
            author_para = para.text.strip()
            break
    if author_para:
        author_str = author_para.split(":", 1)[-1].strip()
        authors_list = [a.strip() for a in author_str.split(";") if a.strip()]

    language = _detect_language(full_text[:2000])

    return ExtractedDocument(
        path=str(path.absolute()),
        filename=path.name,
        title=title,
        authors=str(authors_list),
        year=None,
        doi="",
        page_count=1,
        file_size=path.stat().st_size,
        language=language,
        text_by_page={1: full_text},
        full_text=full_text,
    )


def _extract_txt(file_path: str) -> Optional[ExtractedDocument]:
    path = Path(file_path)
    try:
        raw = path.read_bytes()
        full_text = raw.decode("utf-8", errors="replace")
    except Exception as e:
        logger.error(f"Failed to read TXT {file_path}: {e}")
        return None

    if not full_text.strip():
        return None

    lines = [l.strip() for l in full_text.splitlines() if l.strip()]
    title = lines[0] if lines else path.stem

    language = _detect_language(full_text[:2000])

    return ExtractedDocument(
        path=str(path.absolute()),
        filename=path.name,
        title=title,
        authors="[]",
        year=None,
        doi="",
        page_count=1,
        file_size=path.stat().st_size,
        language=language,
        text_by_page={1: full_text},
        full_text=full_text,
    )


def _extract_markdown(file_path: str) -> Optional[ExtractedDocument]:
    path = Path(file_path)
    try:
        raw = path.read_bytes()
        text = raw.decode("utf-8", errors="replace")
    except Exception as e:
        logger.error(f"Failed to read MD {file_path}: {e}")
        return None

    if not text.strip():
        return None

    # Try to extract YAML frontmatter
    title = path.stem
    authors_list = []
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            front = text[3:end].strip()
            text = text[end + 3:].strip()
            for line in front.splitlines():
                if ":" in line:
                    key, val = line.split(":", 1)
                    key = key.strip().lower()
                    val = val.strip().strip('"').strip("'")
                    if key == "title" and val:
                        title = val
                    elif key == "author" or key == "authors":
                        authors_list = [a.strip() for a in val.split(",") if a.strip()]

    # Remove markdown syntax for clean plain text
    clean = re.sub(r'!?\[([^\]]*)\]\([^)]+\)', r'\1', text)
    clean = re.sub(r'#{1,6}\s+', '', clean)
    clean = re.sub(r'[*_~`]', '', clean)
    clean = re.sub(r'^\s*[-*+]\s+', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'^\s*\d+\.\s+', '', clean, flags=re.MULTILINE)

    language = _detect_language(clean[:2000])

    return ExtractedDocument(
        path=str(path.absolute()),
        filename=path.name,
        title=title,
        authors=str(authors_list),
        year=None,
        doi="",
        page_count=1,
        file_size=path.stat().st_size,
        language=language,
        text_by_page={1: clean},
        full_text=clean,
    )


def _extract_html(file_path: str) -> Optional[ExtractedDocument]:
    path = Path(file_path)
    try:
        from lxml import html
        raw = path.read_bytes()
        doc = html.fromstring(raw)
    except Exception as e:
        logger.error(f"Failed to parse HTML {file_path}: {e}")
        return None

    # Remove script/style
    for el in doc.xpath("//script | //style | //nav | //footer | //header"):
        el.getparent().remove(el)

    title_el = doc.find(".//title")
    title = title_el.text_content().strip() if title_el is not None else path.stem

    body = doc.find(".//body")
    full_text = body.text_content().strip() if body is not None else doc.text_content().strip()

    if not full_text:
        return None

    # Collapse whitespace
    full_text = re.sub(r'\s+', '\n', full_text).strip()

    language = _detect_language(full_text[:2000])

    return ExtractedDocument(
        path=str(path.absolute()),
        filename=path.name,
        title=title,
        authors="[]",
        year=None,
        doi="",
        page_count=1,
        file_size=path.stat().st_size,
        language=language,
        text_by_page={1: full_text},
        full_text=full_text,
    )


def _extract_epub(file_path: str) -> Optional[ExtractedDocument]:
    try:
        from ebooklib import epub
    except ImportError:
        logger.error("ebooklib not installed")
        return None

    path = Path(file_path)
    try:
        book = epub.read_epub(file_path)
    except Exception as e:
        logger.error(f"Failed to parse EPUB {file_path}: {e}")
        return None

    text_parts = []
    title = path.stem
    authors_list = []

    # Get metadata
    title_meta = book.get_metadata("DC", "title")
    if title_meta:
        title = title_meta[0][0]

    authors_meta = book.get_metadata("DC", "creator")
    if authors_meta:
        authors_list = [a[0] for a in authors_meta]

    # Extract text from all items
    for item in book.get_items():
        if item.get_type() == 9:  # ITEM_DOCUMENT
            try:
                content = item.get_content()
                if content:
                    text = content.decode("utf-8", errors="replace")
                    # Strip HTML tags
                    text = re.sub(r'<[^>]+>', ' ', text)
                    text = re.sub(r'\s+', ' ', text).strip()
                    if text:
                        text_parts.append(text)
            except Exception:
                continue

    full_text = "\n".join(text_parts)
    if not full_text.strip():
        return None

    language = _detect_language(full_text[:2000])

    return ExtractedDocument(
        path=str(path.absolute()),
        filename=path.name,
        title=title,
        authors=str(authors_list),
        year=None,
        doi="",
        page_count=1,
        file_size=path.stat().st_size,
        language=language,
        text_by_page={1: full_text},
        full_text=full_text,
    )


def _detect_language(text: str) -> str:
    vietnamese_chars = set("ăâđêôơưàáãảạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ")
    count_vn = sum(1 for c in text.lower() if c in vietnamese_chars)
    if count_vn > 5:
        return "vi"
    return "en"
