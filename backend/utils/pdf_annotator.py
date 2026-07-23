import io
from pathlib import Path

import fitz
from loguru import logger


def add_highlights_to_pdf(
    pdf_path: str | Path,
    highlights: list[dict],
    output_path: str | Path | None = None,
) -> bytes:
    """
    Add yellow highlight annotations to a PDF.

    Args:
        pdf_path: Path to the input PDF file.
        highlights: List of {page: int, text: str} — text must match
                    the PDF verbatim for search_for to find it.
        output_path: If set, write the modified PDF to this path.

    Returns:
        Bytes of the modified PDF.
    """
    doc = fitz.open(str(pdf_path))
    total_added = 0
    total_skipped = 0

    for hl in highlights:
        page_num = hl.get("page", 1) - 1
        text = hl.get("text", "").strip()
        if not text:
            continue
        if page_num < 0 or page_num >= len(doc):
            logger.warning(f"Highlight skipped — page {page_num + 1} out of range")
            total_skipped += 1
            continue

        page = doc[page_num]

        rects = _search_text_variants(page, text)
        if not rects:
            total_skipped += 1
            continue

        annot = page.add_highlight_annotation(rects)
        annot.set_colors(stroke=fitz.utils.getColor("yellow"))
        annot.set_opacity(0.3)
        annot.update()
        total_added += 1

    logger.info(
        f"PDF highlight: {total_added} added, {total_skipped} skipped "
        f"(out of {len(highlights)} requested)"
    )

    buf = io.BytesIO()
    doc.save(buf, garbage=4, deflate=True)
    doc.close()

    pdf_bytes = buf.getvalue()

    if output_path:
        Path(output_path).write_bytes(pdf_bytes)

    return pdf_bytes


def _search_text_variants(page: fitz.Page, text: str) -> list[fitz.Rect]:
    """
    Try to find 'text' on the page with a few normalisations.
    Returns a list of rects (one per match) or empty list.
    """
    rects = page.search_for(text)

    if not rects:
        stripped = text.strip()
        if stripped != text:
            rects = page.search_for(stripped)

    if not rects and len(text) > 200:
        shorter = text[:200]
        rects = page.search_for(shorter)

    return rects


def save_highlighted_pdf(
    pdf_path: str | Path,
    highlights: list[dict],
    output_path: str | Path,
) -> str:
    """
    Generate a highlighted PDF and save it permanently to disk.
    Returns the output path as a string.
    """
    add_highlights_to_pdf(pdf_path, highlights, output_path=output_path)
    return str(output_path)
