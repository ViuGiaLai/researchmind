"""OCR helpers for embedded and standalone images during document import."""

from __future__ import annotations

import threading
from io import BytesIO
from typing import Optional

from loguru import logger

_ocr_lock = threading.Lock()
_global_ocr_engine = None

MIN_IMAGE_DIM = 80
MIN_IMAGE_BYTES = 4096
MAX_IMAGES_PER_PAGE = 8
MAX_IMAGES_PER_DOC = 40


def get_ocr_engine():
    global _global_ocr_engine
    with _ocr_lock:
        if _global_ocr_engine is None:
            from rapidocr_onnxruntime import RapidOCR

            _global_ocr_engine = RapidOCR()
        return _global_ocr_engine


def _image_dimensions(image_bytes: bytes) -> Optional[tuple[int, int]]:
    try:
        from PIL import Image

        with Image.open(BytesIO(image_bytes)) as img:
            return img.size
    except Exception:
        return None


def ocr_image_bytes(
    image_bytes: bytes,
    min_chars: int = 3,
    *,
    skip_byte_size_check: bool = False,
) -> Optional[str]:
    """Run OCR on raw image bytes; returns None if image is too small or unreadable."""
    if not image_bytes or len(image_bytes) < 64:
        return None

    dims = _image_dimensions(image_bytes)
    if not dims:
        return None
    width, height = dims
    if width < MIN_IMAGE_DIM or height < MIN_IMAGE_DIM:
        return None

    if not skip_byte_size_check and len(image_bytes) < MIN_IMAGE_BYTES:
        return None

    try:
        with _ocr_lock:
            engine = get_ocr_engine()
            results, _ = engine(image_bytes)
        if not results:
            return None
        lines = [
            str(res[1]).strip()
            for res in results
            if res and len(res) > 1 and str(res[1]).strip()
        ]
        text = "\n".join(lines).strip()
        return text if len(text) >= min_chars else None
    except Exception as exc:
        logger.warning(f"Image OCR failed: {exc}")
        return None


def extract_pdf_page_image_text(page, doc, max_images: int = MAX_IMAGES_PER_PAGE) -> list[str]:
    """OCR embedded images on a PDF page (figures, charts, scanned snippets)."""
    snippets: list[str] = []
    try:
        images = page.get_images(full=True)
    except Exception:
        return snippets

    for idx, img_info in enumerate(images[:max_images]):
        xref = img_info[0]
        try:
            base = doc.extract_image(xref)
            width = int(base.get("width") or 0)
            height = int(base.get("height") or 0)
            if width < MIN_IMAGE_DIM or height < MIN_IMAGE_DIM:
                continue
            img_bytes = base.get("image")
            if not img_bytes:
                continue
            ocr_text = ocr_image_bytes(img_bytes, skip_byte_size_check=True)
            if ocr_text:
                snippets.append(f"[Nội dung hình ảnh {idx + 1}]: {ocr_text}")
        except Exception as exc:
            logger.debug(f"Skip PDF image xref={xref}: {exc}")
    return snippets


DOCX_IMAGE_RELTYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
)


def extract_docx_image_text(doc, max_images: int = MAX_IMAGES_PER_DOC) -> list[str]:
    """OCR images embedded in a DOCX file."""
    snippets: list[str] = []
    seen_hashes: set[int] = set()
    img_count = 0

    for rel in doc.part.rels.values():
        if img_count >= max_images:
            break
        if rel.reltype != DOCX_IMAGE_RELTYPE:
            continue
        try:
            blob = rel.target_part.blob
            if not blob:
                continue
            blob_key = hash(blob[:512])
            if blob_key in seen_hashes:
                continue
            seen_hashes.add(blob_key)

            ocr_text = ocr_image_bytes(blob, skip_byte_size_check=True)
            if ocr_text:
                img_count += 1
                snippets.append(f"[Nội dung hình ảnh {img_count}]: {ocr_text}")
        except Exception as exc:
            logger.debug(f"Skip DOCX image: {exc}")
    return snippets


def extract_docx_table_text(doc) -> list[str]:
    """Flatten DOCX tables into searchable plain text."""
    parts: list[str] = []
    for table_index, table in enumerate(doc.tables):
        rows_text: list[str] = []
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                rows_text.append(" | ".join(cells))
        if rows_text:
            parts.append(f"[Bảng {table_index + 1}]\n" + "\n".join(rows_text))
    return parts
