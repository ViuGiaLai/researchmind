"""
DOI Extraction với fallback chain 4 bước.
Ưu tiên: PDF metadata > regex text > Crossref title search > bỏ qua.

DOI đã có trong PDF metadata (PyMuPDF) — đây là happy path chính.
"""
import re
from pathlib import Path
from typing import Optional

from .crossref import find_doi_by_title

DOI_PATTERN = re.compile(
    r'\b(10\.\d{4,}(?:\.\d+)*\/(?:(?!["&\'<>])\S)+)\b',
    re.IGNORECASE
)


async def extract_doi_from_paper(
    pdf_path: Optional[str] = None,
    title: Optional[str] = None,
    authors: Optional[list[str]] = None,
    context_text: Optional[str] = None
) -> Optional[str]:
    if pdf_path:
        doi = _extract_from_pdf_metadata(pdf_path)
        if doi:
            return _clean_doi(doi)

    if context_text:
        doi = _extract_from_text(context_text)
        if doi:
            return _clean_doi(doi)

    if title:
        doi = await find_doi_by_title(title, authors)
        if doi:
            return _clean_doi(doi)

    return None


def _extract_from_pdf_metadata(pdf_path: str) -> Optional[str]:
    try:
        import fitz
        doc = fitz.open(pdf_path)
        meta = doc.metadata or {}
        doc.close()

        for field in ["subject", "keywords", "doi", "identifier"]:
            value = meta.get(field, "")
            if value:
                match = DOI_PATTERN.search(value)
                if match:
                    return match.group(1)

        return None
    except Exception:
        return None


def _extract_from_text(text: str) -> Optional[str]:
    search_zone = text[:2000]
    match = DOI_PATTERN.search(search_zone)
    if match:
        return match.group(1)

    match = DOI_PATTERN.search(text)
    return match.group(1) if match else None


def _clean_doi(doi: str) -> str:
    doi = doi.strip()
    doi = re.sub(r'^https?://doi\.org/', '', doi)
    return doi.lower()


def extract_multiple_dois(context_text: str) -> list[str]:
    matches = DOI_PATTERN.findall(context_text)
    seen = set()
    result = []
    for doi in matches:
        cleaned = _clean_doi(doi)
        if cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result
