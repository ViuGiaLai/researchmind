"""
Ghép local RAG context với external academic data thành 1 prompt context.
LLM nhận context này để generate câu trả lời có chứng cứ.
"""
from dataclasses import dataclass
from typing import Optional

from .openalex import OpenAlexWork
from .crossref import CrossrefWork


@dataclass
class ExternalPaperData:
    doi: str
    title: str
    openalex: Optional[OpenAlexWork]
    crossref: Optional[CrossrefWork]
    recent_citing: list[dict]


def build_verify_context(
    local_context: str,
    external_data: list[ExternalPaperData]
) -> str:
    sections = []

    sections.append(
        "=== TÀI LIỆU CỦA NGƯỜI DÙNG (Local) ===\n"
        + local_context
    )

    if external_data:
        ext_sections = []
        for ep in external_data:
            block = _format_external_paper(ep)
            if block:
                ext_sections.append(block)

        if ext_sections:
            sections.append(
                "=== DỮ LIỆU HỌC THUẬT BÊN NGOÀI (OpenAlex + Crossref) ===\n"
                + "\n\n".join(ext_sections)
            )
    else:
        sections.append(
            "=== DỮ LIỆU HỌC THUẬT BÊN NGOÀI ===\n"
            "Không tìm được dữ liệu external cho các paper trong ngữ cảnh này."
        )

    return "\n\n".join(sections)


def _format_external_paper(ep: ExternalPaperData) -> str:
    lines = []

    title = ep.title or ep.doi
    lines.append(f"[PAPER: {title}]")
    lines.append(f"DOI: {ep.doi}")

    if ep.crossref and ep.crossref.is_valid:
        cr = ep.crossref
        if cr.authors:
            lines.append(f"Tác giả: {', '.join(cr.authors[:3])}"
                         + (" et al." if len(cr.authors) > 3 else ""))
        if cr.journal:
            lines.append(f"Tạp chí: {cr.journal}")
        if cr.year:
            lines.append(f"Năm: {cr.year}")
        lines.append(f"Citations (Crossref): {cr.citation_count}")

    if ep.openalex:
        oa = ep.openalex
        lines.append(f"Citations (OpenAlex): {oa.citation_count}")
        lines.append(f"Số paper liên quan: {len(oa.related_work_ids)}")

    if ep.recent_citing:
        lines.append(f"\nCác nghiên cứu gần đây (từ 2022) trích dẫn paper này:")
        for i, work in enumerate(ep.recent_citing[:5], 1):
            r_title = work.get("title", "Unknown")
            r_year = work.get("publication_year", "?")
            r_doi = work.get("doi", "")
            lines.append(f"  {i}. {r_title} ({r_year})"
                         + (f" — doi:{r_doi}" if r_doi else ""))

    return "\n".join(lines)
