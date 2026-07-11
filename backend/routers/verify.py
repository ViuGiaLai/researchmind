"""
POST /api/verify â€” Academic Verification endpoint.
Káº¿t há»£p Local RAG + OpenAlex + Crossref + Semantic Scholar.
Cung cáº¥p: metadata verification, citation analysis, related research, evolution.
"""

import asyncio
import json
import re
from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import ChatHistory, Paper
from loguru import logger

from academic.openalex import OpenAlexWork, get_work_by_doi, get_work_by_title, get_recent_citing_works
from academic.crossref import CrossrefWork, get_work_by_doi as crossref_get_work
from academic.semantic_scholar import S2Paper, get_paper_by_doi as s2_get_by_doi, get_citations as s2_get_citations, get_recommendations as s2_get_recommendations
from academic.doi_extractor import extract_doi_from_paper, extract_multiple_dois
from academic.paper_check import check_papers_ready
from common.rag_ready import rag_unavailable_message
from common.i18n import t, get_language
from academic.context_builder import ExternalPaperData
from academic.cache import cache_get, cache_set, TTL_OPENALEX, TTL_CROSSREF

router = APIRouter(prefix="/api/verify", tags=["verify"])


class VerifyRequest(BaseModel):
    message: str
    paper_ids: list[str] = []
    collection_id: Optional[str] = None
    session_id: Optional[str] = None
    stream: bool = False


def _resolve_collection_paper_ids(collection_id: str | None) -> list[str]:
    if not collection_id:
        return []
    from db.models import CollectionPaper

    session = get_session(state.engine)
    try:
        return [
            row.paper_id
            for row in session.query(CollectionPaper.paper_id)
            .filter(CollectionPaper.collection_id == collection_id)
            .all()
        ]
    finally:
        session.close()


@router.post("")
async def verify_research(http_request: Request, body: VerifyRequest = Body(...)):
    import time as time_mod
    t0 = time_mod.time()
    lang = get_language(http_request)

    if not body.message:
        raise HTTPException(400, t("error.message_empty", lang))

    query = body.message
    paper_ids = body.paper_ids
    if body.collection_id and not paper_ids:
        paper_ids = _resolve_collection_paper_ids(body.collection_id)
    session_id = body.session_id or "verify"
    do_stream = body.stream

    rag_error = rag_unavailable_message(lang)
    if rag_error:
        return {"answer": rag_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0, "external_sources": [], "verify_status": "local_only"}

    paper_error = check_papers_ready(paper_ids, lang)
    if paper_error:
        return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0, "external_sources": [], "verify_status": "local_only"}

    t_retrieve = time_mod.time()
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=query,
        paper_ids=paper_ids,
        top_k=5,
    )
    t_retrieve = time_mod.time() - t_retrieve

    t_doi = time_mod.time()
    papers_meta = await asyncio.to_thread(_get_papers_metadata, paper_ids)

    # --- Extract DOIs ---
    dois_to_lookup = []
    for paper in papers_meta:
        doi = await extract_doi_from_paper(
            pdf_path=paper.get("file_path"),
            title=paper.get("title"),
            authors=paper.get("authors", []),
            context_text=retrieval.context_text
        )
        if doi:
            dois_to_lookup.append((doi, paper.get("title", "")))

    extra_dois = extract_multiple_dois(retrieval.context_text)
    for doi in extra_dois:
        if doi not in [d for d, _ in dois_to_lookup]:
            dois_to_lookup.append((doi, ""))
    t_doi = time_mod.time() - t_doi

    # --- Lookup ALL sources ---
    external_data = []
    verify_status = "local_only"

    t_lookup = 0.0
    cache_status_by_doi: dict[str, dict[str, str]] = {}

    if dois_to_lookup:
        for doi, _ in dois_to_lookup[:3]:
            cache_status_by_doi[doi] = {
                "oa": "hit" if cache_get(f"oa:{doi}", TTL_OPENALEX) else "miss",
                "cr": "hit" if cache_get(f"cr:{doi}", TTL_CROSSREF) else "miss",
            }

        t_lookup = time_mod.time()
        tasks = [_full_lookup(doi, title) for doi, title in dois_to_lookup[:3]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, ExternalPaperData):
                external_data.append(result)

        if external_data:
            has_full_meta = any(
                ep.openalex is not None and ep.crossref is not None
                for ep in external_data
            )
            has_any = any(
                ep.openalex is not None or ep.crossref is not None or ep.semantic_scholar is not None
                for ep in external_data
            )
            verify_status = "full" if has_full_meta else ("partial" if has_any else "local_only")

        t_lookup = time_mod.time() - t_lookup

        # Log cache hit/miss for each DOI
        for doi, _ in dois_to_lookup[:3]:
            cache_status = cache_status_by_doi.get(doi, {"oa": "miss", "cr": "miss"})
            logger.info(f"VERIFY_CACHE doi={doi} oa={cache_status['oa']} cr={cache_status['cr']}")

    external_sources_json = [_serialize_external(ep) for ep in external_data]

    # --- Build rich academic prompt ---
    combined_context = _build_academic_context(
        local_context=retrieval.context_text,
        external_data=external_data,
        papers_meta=papers_meta,
    )

    if do_stream:
        return StreamingResponse(
            _stream_verify_response(
                query=query,
                combined_context=combined_context,
                external_sources_json=external_sources_json,
                verify_status=verify_status,
                papers_used=retrieval.papers_used,
                session_id=session_id,
                lang=lang,
                timing={
                    "start": t0,
                    "retrieve": t_retrieve,
                    "doi_extract": t_doi,
                    "lookup": t_lookup,
                },
            ),
            media_type="text/event-stream",
        )

    t_generate = time_mod.time()
    generation = await asyncio.to_thread(
        state.generator.generate_verify,
        query=query,
        context_text=combined_context,
        external_data_text="",
        task_type="verify",
        lang=lang,
    )
    t_generate = time_mod.time() - t_generate

    session = get_session(state.engine)
    try:
        session.add(ChatHistory(
            session_id=session_id, role="user",
            content=query, context_papers=json.dumps(paper_ids),
            citations="[]", model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id, role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save verify history: {e}")
    finally:
        session.close()

    t_total = time_mod.time() - t0
    logger.info(f"VERIFY_TIMING retrieve={t_retrieve:.2f}s doi_extract={t_doi:.2f}s lookup={t_lookup:.2f}s generate={t_generate:.2f}s total={t_total:.2f}s status={verify_status}")

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "external_sources": external_sources_json,
        "verify_status": verify_status,
    }


def _build_academic_context(
    local_context: str,
    external_data: list[ExternalPaperData],
    papers_meta: list[dict],
) -> str:
    sections = []

    # Local context
    sections.append(
        "=== TÃ€I LIá»†U Cá»¦A NGÆ¯á»œI DÃ™NG (Local) ===\n"
        + local_context
    )

    # Paper metadata summary
    if papers_meta:
        meta_lines = []
        for p in papers_meta:
            title = p.get("title", "Unknown")
            authors = ", ".join(p.get("authors", [])[:3]) or "N/A"
            meta_lines.append(f"- {title} (tÃ¡c giáº£: {authors})")
        if meta_lines:
            sections.append("=== PAPER ÄÆ¯á»¢C PHÃ‚N TÃCH ===\n" + "\n".join(meta_lines))

    # External academic data
    if external_data:
        ext_sections = []
        for ep in external_data:
            block = _format_rich_external(ep)
            if block:
                ext_sections.append(block)
        if ext_sections:
            sections.append(
                "=== Dá»® LIá»†U Há»ŒC THUáº¬T BÃŠN NGOÃ€I (OpenAlex + Crossref + Semantic Scholar) ===\n"
                + "\n\n".join(ext_sections)
            )
    else:
        sections.append(
            "=== Dá»® LIá»†U Há»ŒC THUáº¬T BÃŠN NGOÃ€I ===\n"
            "KhÃ´ng tÃ¬m tháº¥y DOI hoáº·c dá»¯ liá»‡u external cho cÃ¡c paper nÃ y. "
            "HÃ£y tráº£ lá»i dá»±a trÃªn tÃ i liá»‡u local vÃ  kiáº¿n thá»©c cá»§a báº¡n."
        )

    return "\n\n".join(sections)


def _format_rich_external(ep: ExternalPaperData) -> str:
    lines = []
    title = ep.title or ep.doi
    lines.append(f"[PAPER: {title}]")
    lines.append(f"DOI: {ep.doi}")

    # Crossref metadata
    if ep.crossref and ep.crossref.is_valid:
        cr = ep.crossref
        if cr.authors:
            lines.append(f"TÃ¡c giáº£: {', '.join(cr.authors[:3])}" + (" et al." if len(cr.authors) > 3 else ""))
        if cr.journal:
            lines.append(f"Táº¡p chÃ­: {cr.journal}")
        if cr.year:
            lines.append(f"NÄƒm: {cr.year}")
        lines.append(f"Citations (Crossref): {cr.citation_count}")

    # OpenAlex data
    if ep.openalex:
        oa = ep.openalex
        lines.append(f"Citations (OpenAlex): {oa.citation_count}")
        lines.append(f"Sá»‘ paper liÃªn quan: {len(oa.related_work_ids)}")
        if oa.publication_year:
            lines.append(f"NÄƒm xuáº¥t báº£n: {oa.publication_year}")

    # Semantic Scholar data
    if ep.semantic_scholar:
        ss = ep.semantic_scholar
        lines.append(f"Citations (Semantic Scholar): {ss.citation_count}")
        lines.append(f"Influential citations: {ss.influential_citation_count}")
        if ss.venue:
            lines.append(f"Venue: {ss.venue}")

    # Recent citing works (evolution)
    if ep.recent_citing:
        lines.append(f"\nCÃ¡c nghiÃªn cá»©u gáº§n Ä‘Ã¢y (tá»« 2022) trÃ­ch dáº«n paper nÃ y:")
        for i, work in enumerate(ep.recent_citing[:5], 1):
            r_title = work.get("title", "Unknown")
            r_year = work.get("publication_year", "?")
            r_doi = work.get("doi", "")
            lines.append(f"  {i}. {r_title} ({r_year})" + (f" â€” doi:{r_doi}" if r_doi else ""))

    # Semantic Scholar citations
    if ep.s2_citations:
        lines.append(f"\nCÃ¡c paper trÃ­ch dáº«n (Semantic Scholar, top 5):")
        for i, cite in enumerate(ep.s2_citations[:5], 1):
            lines.append(f"  {i}. {cite.title} ({cite.year or '?'}) â€” {cite.citation_count} citations")

    # Semantic Scholar recommendations
    if ep.s2_recommendations:
        lines.append(f"\nPaper tÆ°Æ¡ng tá»± Ä‘Æ°á»£c Ä‘á» xuáº¥t:")
        for i, rec in enumerate(ep.s2_recommendations[:3], 1):
            lines.append(f"  {i}. {rec.title} ({rec.year or '?'}) â€” {rec.citation_count} citations")

    return "\n".join(lines)


async def _full_lookup(doi: str, fallback_title: str) -> ExternalPaperData:
    """Lookup paper across OpenAlex + Crossref + Semantic Scholar."""
    oa_cached = _openalex_from_cache(cache_get(f"oa:{doi}", TTL_OPENALEX))
    cr_cached = _crossref_from_cache(cache_get(f"cr:{doi}", TTL_CROSSREF))

    oa_task = _cached_or_fetch(oa_cached, get_work_by_doi(doi))
    cr_task = _cached_or_fetch(cr_cached, crossref_get_work(doi))
    s2_task = _cached_or_fetch(None, s2_get_by_doi(doi))

    oa_result, cr_result, s2_result = await asyncio.gather(oa_task, cr_task, s2_task, return_exceptions=True)

    oa_result = oa_result if not isinstance(oa_result, BaseException) else None
    cr_result = cr_result if not isinstance(cr_result, BaseException) else None
    s2_result = s2_result if not isinstance(s2_result, BaseException) else None

    if oa_result is None and fallback_title:
        oa_result = await get_work_by_title(fallback_title)

    # Recent citing from OpenAlex
    recent_citing = []
    if oa_result and oa_result.openalex_id:
        recent_citing = await get_recent_citing_works(oa_result.openalex_id, since_year=2022, limit=5)

    # Semantic Scholar citations + recommendations
    s2_citations = []
    s2_recommendations = []
    if s2_result and s2_result.paper_id:
        cite_task = s2_get_citations(s2_result.paper_id, limit=10)
        rec_task = s2_get_recommendations(s2_result.paper_id, limit=5)
        s2_cite_res, s2_rec_res = await asyncio.gather(cite_task, rec_task, return_exceptions=True)
        if not isinstance(s2_cite_res, BaseException):
            s2_citations = s2_cite_res
        if not isinstance(s2_rec_res, BaseException):
            s2_recommendations = s2_rec_res

    # Cache
    if oa_result:
        cache_set(f"oa:{doi}", "openalex", {
            "openalex_id": oa_result.openalex_id,
            "doi": oa_result.doi,
            "title": oa_result.title,
            "publication_year": oa_result.publication_year,
            "citation_count": oa_result.citation_count,
            "related_work_ids": oa_result.related_work_ids,
            "referenced_work_ids": oa_result.referenced_work_ids,
        })
    if cr_result:
        cache_set(f"cr:{doi}", "crossref", {
            "doi": cr_result.doi,
            "title": cr_result.title,
            "authors": cr_result.authors,
            "journal": cr_result.journal,
            "year": cr_result.year,
            "publisher": cr_result.publisher,
            "citation_count": cr_result.citation_count,
            "is_valid": cr_result.is_valid,
        })

    title = (cr_result.title if cr_result else None) or fallback_title or doi

    return ExternalPaperData(
        doi=doi,
        title=title,
        openalex=oa_result,
        crossref=cr_result,
        semantic_scholar=s2_result,
        recent_citing=recent_citing,
        s2_citations=s2_citations,
        s2_recommendations=s2_recommendations,
    )


async def _cached_or_fetch(cached, coro):
    if cached is not None:
        coro.close()
        return cached
    try:
        return await asyncio.wait_for(coro, timeout=5.0)
    except (asyncio.TimeoutError, Exception):
        return None


def _openalex_from_cache(data: dict | None) -> OpenAlexWork | None:
    if not data:
        return None
    return OpenAlexWork(
        openalex_id=data.get("openalex_id", ""),
        doi=data.get("doi"),
        title=data.get("title", ""),
        publication_year=data.get("publication_year"),
        citation_count=data.get("citation_count", 0),
        related_work_ids=data.get("related_work_ids", []),
        referenced_work_ids=data.get("referenced_work_ids", []),
        recent_citing_works=data.get("recent_citing_works", []),
    )


def _crossref_from_cache(data: dict | None) -> CrossrefWork | None:
    if not data:
        return None
    return CrossrefWork(
        doi=data.get("doi", ""),
        title=data.get("title", ""),
        authors=data.get("authors", []),
        journal=data.get("journal"),
        year=data.get("year"),
        publisher=data.get("publisher"),
        citation_count=data.get("citation_count", 0),
        is_valid=data.get("is_valid", True),
    )


def _serialize_external(ep: ExternalPaperData) -> dict:
    result = {
        "doi": ep.doi,
        "title": ep.title,
        "openalex": None,
        "crossref": None,
        "semantic_scholar": None,
        "recent_citing": ep.recent_citing,
        "s2_citations": [],
        "s2_recommendations": [],
    }
    if ep.openalex:
        result["openalex"] = {
            "citation_count": ep.openalex.citation_count,
            "publication_year": ep.openalex.publication_year,
            "related_count": len(ep.openalex.related_work_ids),
            "openalex_id": ep.openalex.openalex_id,
        }
    if ep.crossref:
        result["crossref"] = {
            "authors": ep.crossref.authors,
            "journal": ep.crossref.journal,
            "year": ep.crossref.year,
            "publisher": ep.crossref.publisher,
            "citation_count": ep.crossref.citation_count,
            "is_valid": ep.crossref.is_valid,
        }
    if ep.semantic_scholar:
        result["semantic_scholar"] = {
            "paper_id": ep.semantic_scholar.paper_id,
            "citation_count": ep.semantic_scholar.citation_count,
            "influential_citation_count": ep.semantic_scholar.influential_citation_count,
            "venue": ep.semantic_scholar.venue,
        }
    if ep.s2_citations:
        result["s2_citations"] = [
            {"title": c.title, "year": c.year, "citation_count": c.citation_count}
            for c in ep.s2_citations[:5]
        ]
    if ep.s2_recommendations:
        result["s2_recommendations"] = [
            {"title": r.title, "year": r.year, "citation_count": r.citation_count}
            for r in ep.s2_recommendations[:3]
        ]
    return result


def _stream_verify_response(query, combined_context, external_sources_json, verify_status, papers_used, session_id, lang="vi", timing=None):
    import time as time_mod
    t_stream = time_mod.time()
    timing = timing or {}
    full_response = ""
    model_used = ""

    yield f"data: {json.dumps({'type': 'academic', 'data': external_sources_json, 'verify_status': verify_status})}\n\n"

    for chunk in state.generator.stream_generate_verify(query, combined_context, task_type="verify", lang=lang):
        full_response += chunk
        yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"

    model_used = state.generator.current_model

    citations = []
    pattern = r'\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]'
    for match in re.finditer(pattern, full_response):
        citations.append({
            "source": match.group(1).strip(),
            "page": int(match.group(2)) if match.group(2) else None,
            "text": match.group(0),
        })

    db = get_session(state.engine)
    try:
        db.add(ChatHistory(
            session_id=session_id, role="user",
            content=query, context_papers=json.dumps(papers_used),
            citations="[]", model_used="",
        ))
        db.add(ChatHistory(
            session_id=session_id, role="assistant",
            content=full_response,
            context_papers=json.dumps(papers_used),
            citations=json.dumps(citations),
            model_used=model_used,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save streamed verify history: {e}")
    finally:
        db.close()

    yield f"data: {json.dumps({'type': 'done', 'model_used': model_used, 'citations': citations, 'external_sources': external_sources_json, 'verify_status': verify_status})}\n\n"

    stream_generate = time_mod.time() - t_stream
    total = time_mod.time() - timing["start"] if timing.get("start") else stream_generate
    logger.info(
        "VERIFY_TIMING "
        f"retrieve={timing.get('retrieve', 0.0):.2f}s "
        f"doi_extract={timing.get('doi_extract', 0.0):.2f}s "
        f"lookup={timing.get('lookup', 0.0):.2f}s "
        f"stream_generate={stream_generate:.2f}s "
        f"total={total:.2f}s "
        f"status={verify_status}"
    )


def _get_papers_metadata(paper_ids: list[str]) -> list[dict]:
    if not paper_ids:
        return []
    session = get_session(state.engine)
    try:
        papers = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        return [
            {
                "file_path": p.file_path,
                "title": p.title,
                "authors": p.authors.split(",") if p.authors else [],
                "year": p.year,
                "doi": p.doi,
            }
            for p in papers
        ]
    finally:
        session.close()
