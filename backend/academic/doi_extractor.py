"""
DOI Extraction với fallback chain 4 bước.
Ưu tiên: PDF metadata > regex text > Crossref title search > bỏ qua.

DOI đã có trong PDF metadata (PyMuPDF) — đây là happy path chính.
"""

import re

from .crossref import find_doi_by_title

DOI_PATTERN = re.compile(r'\b(10\.\d{4,}(?:\.\d+)*\/(?:(?!["&\'<>])\S)+)\b', re.IGNORECASE)


async def extract_doi_from_paper(
    pdf_path: str | None = None,
    title: str | None = None,
    authors: list[str] | None = None,
    context_text: str | None = None,
) -> str | None:
    if pdf_path:
        doi = _extract_from_pdf_metadata(pdf_path)
        if doi:
            return _clean_doi(doi)

        doi = _extract_from_pdf_text(pdf_path)
        if doi:
            return _clean_doi(doi)

    if context_text:
        doi = _extract_from_text(context_text)
        if doi:
            return _clean_doi(doi)

    if title:
        doi = await find_doi_by_title(_clean_title(title), authors)
        if doi:
            return _clean_doi(doi)

    return None


def _extract_from_pdf_metadata(pdf_path: str) -> str | None:
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


def _extract_from_pdf_text(pdf_path: str) -> str | None:
    try:
        import fitz

        doc = fitz.open(pdf_path)
        text = ""
        for page in doc.pages(0, min(3, len(doc))):
            text += page.get_text("text")
        doc.close()

        match = DOI_PATTERN.search(text[:3000])
        return match.group(1) if match else None
    except Exception:
        return None


def _extract_from_text(text: str) -> str | None:
    search_zone = text[:2000]
    match = DOI_PATTERN.search(search_zone)
    if match:
        return match.group(1)

    match = DOI_PATTERN.search(text)
    return match.group(1) if match else None


def _clean_title(title: str) -> str:
    """Remove UUID prefix, URL encoding, and leading garbage from paper titles."""
    import re as _re

    cleaned = _re.sub(r"^[0-9a-f-]{36}_", "", title)
    cleaned = cleaned.replace("+", " ")
    cleaned = _re.sub(r"%[0-9a-fA-F]{2}", "", cleaned)
    return cleaned.strip()


def _clean_doi(doi: str) -> str:
    doi = doi.strip()
    doi = re.sub(r"^https?://doi\.org/", "", doi)
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
