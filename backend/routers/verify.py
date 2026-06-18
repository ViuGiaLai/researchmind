"""
POST /api/verify — Verify Mode endpoint.
Kết hợp Local RAG (Tầng 1) + OpenAlex + Crossref (Tầng 2) + LLM (Tầng 3).
"""
import asyncio
import json
import re
from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import ChatHistory, Paper
from loguru import logger

from academic.openalex import get_work_by_doi, get_work_by_title, get_recent_citing_works
from academic.crossref import get_work_by_doi as crossref_get_work
from academic.doi_extractor import extract_doi_from_paper, extract_multiple_dois
from academic.paper_check import check_papers_ready
from academic.context_builder import (
    build_verify_context, ExternalPaperData
)
from academic.cache import cache_get, cache_set, TTL_OPENALEX, TTL_CROSSREF

router = APIRouter(prefix="/api/verify", tags=["verify"])


class VerifyRequest(BaseModel):
    message: str
    paper_ids: list[str] = []
    session_id: Optional[str] = None
    stream: bool = False


@router.post("")
async def verify_research(request: VerifyRequest = Body(...)):
    import time as time_mod
    t0 = time_mod.time()

    if not request.message:
        raise HTTPException(400, "message không được để trống")

    query = request.message
    paper_ids = request.paper_ids
    session_id = request.session_id or "verify"
    do_stream = request.stream

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0, "external_sources": [], "verify_status": "local_only"}

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=query,
        paper_ids=paper_ids,
        top_k=5,
    )

    papers_meta = await asyncio.to_thread(
        _get_papers_metadata, paper_ids
    )

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

    external_data = []
    verify_status = "local_only"

    if dois_to_lookup:
        tasks = [_lookup_paper(doi, title) for doi, title in dois_to_lookup[:3]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, ExternalPaperData):
                external_data.append(result)

        if external_data:
            has_full = any(
                ep.openalex is not None and ep.crossref is not None
                for ep in external_data
            )
            verify_status = "full" if has_full else "partial"

    external_sources_json = [_serialize_external(ep) for ep in external_data]

    combined_context = build_verify_context(
        local_context=retrieval.context_text,
        external_data=external_data
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
            ),
            media_type="text/event-stream",
        )

    generation = await asyncio.to_thread(
        state.generator.generate_verify,
        query=query,
        context_text=combined_context,
        external_data_text="",
    )

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

    logger.info(f"VERIFY: total={time_mod.time()-t0:.2f}s status={verify_status}")

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "external_sources": external_sources_json,
        "verify_status": verify_status,
    }


def _stream_verify_response(query, combined_context, external_sources_json, verify_status, papers_used, session_id):
    full_response = ""
    model_used = ""

    # Event 1: academic data
    yield f"data: {json.dumps({'type': 'academic', 'data': external_sources_json, 'verify_status': verify_status})}\n\n"

    # Event 2: stream LLM tokens
    for chunk in state.generator.stream_generate_verify(query, combined_context):
        full_response += chunk
        yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"

    model_used = state.generator.current_model

    # Extract citations
    citations = []
    pattern = r'\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]'
    for match in re.finditer(pattern, full_response):
        citations.append({
            "source": match.group(1).strip(),
            "page": int(match.group(2)) if match.group(2) else None,
            "text": match.group(0),
        })

    # Save to history
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

    # Event 3: done
    yield f"data: {json.dumps({'type': 'done', 'model_used': model_used, 'citations': citations, 'external_sources': external_sources_json, 'verify_status': verify_status})}\n\n"


async def _lookup_paper(doi: str, fallback_title: str) -> ExternalPaperData:
    oa_cached = cache_get(f"oa:{doi}", TTL_OPENALEX)
    cr_cached = cache_get(f"cr:{doi}", TTL_CROSSREF)

    oa_task = _cached_or_fetch(oa_cached, get_work_by_doi(doi))
    cr_task = _cached_or_fetch(cr_cached, crossref_get_work(doi))

    oa_result, cr_result = await asyncio.gather(oa_task, cr_task)

    if oa_result is None and fallback_title:
        oa_result = await get_work_by_title(fallback_title)

    recent_citing = []
    if oa_result and oa_result.openalex_id:
        recent_citing = await get_recent_citing_works(
            oa_result.openalex_id, since_year=2022, limit=5
        )

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
        recent_citing=recent_citing
    )


async def _cached_or_fetch(cached, coro):
    if cached is not None:
        return cached
    try:
        return await asyncio.wait_for(coro, timeout=5.0)
    except (asyncio.TimeoutError, Exception):
        return None


def _serialize_external(ep: ExternalPaperData) -> dict:
    result = {
        "doi": ep.doi,
        "title": ep.title,
        "openalex": None,
        "crossref": None,
        "recent_citing": ep.recent_citing
    }
    if ep.openalex:
        result["openalex"] = {
            "citation_count": ep.openalex.citation_count,
            "publication_year": ep.openalex.publication_year,
            "related_count": len(ep.openalex.related_work_ids),
            "openalex_id": ep.openalex.openalex_id
        }
    if ep.crossref:
        result["crossref"] = {
            "authors": ep.crossref.authors,
            "journal": ep.crossref.journal,
            "year": ep.crossref.year,
            "publisher": ep.crossref.publisher,
            "citation_count": ep.crossref.citation_count,
            "is_valid": ep.crossref.is_valid
        }
    return result


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
                "authors": p.authors.split(",") if p.authors else []
            }
            for p in papers
        ]
    finally:
        session.close()
