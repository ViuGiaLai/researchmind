import fitz  # PyMuPDF
from pathlib import Path
from typing import Optional
from dataclasses import dataclass
from loguru import logger


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


def extract_pdf(file_path: str) -> Optional[ExtractedDocument]:
    """
    Extract text and metadata from a PDF file.

    Args:
        file_path: Absolute or relative path to the PDF file.

    Returns:
        ExtractedDocument with full text + metadata, or None if extraction fails.
    """
    path = Path(file_path)
    if not path.exists():
        return None

    try:
        doc = fitz.open(file_path)
    except Exception:
        return None

    text_by_page: dict[int, str] = {}
    full_text_parts: list[str] = []
    
    # Lazy load OCR engine only if needed
    ocr_engine = None

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()
        
        # Check if the page is empty or contains almost no text (likely scanned PDF)
        if len(text.strip()) < 40:
            try:
                logger.info(f"Page {page_num + 1} appears to be a scanned page (text length: {len(text.strip())}). Running OCR...")
                if ocr_engine is None:
                    from rapidocr_onnxruntime import RapidOCR
                    ocr_engine = RapidOCR()
                    
                # Render page to a high-quality image (PNG)
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                
                # Perform local OCR
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

    # Extract metadata from PDF info
    meta = doc.metadata or {}
    title = meta.get("title", "").strip() or path.stem
    authors_raw = meta.get("author", "").strip()
    authors_list = [a.strip() for a in authors_raw.split(";") if a.strip()] if authors_raw else []
    authors_json = str(authors_list)  # Simple JSON-like string

    # Try to extract year from metadata or filename
    year = None
    year_str = meta.get("creationDate", "")
    if year_str and len(year_str) >= 4:
        try:
            year = int(year_str[:4])
        except ValueError:
            pass
    if not year:
        # Try to find a 4-digit year in the filename
        import re
        years_found = re.findall(r"\b(19|20)\d{2}\b", path.stem)
        if years_found:
            year = int(years_found[0])

    doi = meta.get("identifier", "").strip() or ""

    # Simple language detection based on character analysis
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


def _detect_language(text: str) -> str:
    """
    Simple language detection: checks for Vietnamese characters.
    Falls back to 'en' if no strong indicators.
    """
    vietnamese_chars = set("ăâđêôơưàáãảạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ")
    count_vn = sum(1 for c in text.lower() if c in vietnamese_chars)
    if count_vn > 5:
        return "vi"
    return "en"
