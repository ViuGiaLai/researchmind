"""
GET  /api/academic/doi          → tra DOI nhanh qua Crossref
GET  /api/academic/paper        → tra paper nhanh qua OpenAlex
POST /api/academic/discover     → search query qua OpenAlex + Semantic Scholar, trả JSON deduped
DELETE /api/academic/cache/{doi} → xoá cache cho DOI cụ thể
"""
import asyncio
from fastapi import APIRouter, Body, Query
from loguru import logger

from academic.openalex import get_work_by_doi as oa_get, search_works as oa_search
from academic.crossref import get_work_by_doi as cr_get
from academic.semantic_scholar import search_papers as s2_search
from academic.cache import cache_get, cache_set, cache_invalidate_doi, TTL_OPENALEX, TTL_CROSSREF

router = APIRouter(prefix="/api/academic", tags=["academic"])


@router.get("/doi")
async def lookup_doi(doi: str = Query(..., description="DOI string, e.g. 10.1234/abcd")):
    cached = cache_get(f"cr:{doi}", TTL_CROSSREF)
    if cached:
        return {"source": "cache", "data": cached}
    result = await cr_get(doi)
    if result:
        cache_set(f"cr:{doi}", "crossref", {
            "doi": result.doi,
            "title": result.title,
            "authors": result.authors,
            "journal": result.journal,
            "year": result.year,
            "publisher": result.publisher,
            "citation_count": result.citation_count,
            "is_valid": result.is_valid,
        })
        return {"source": "crossref", "data": {
            "doi": result.doi,
            "title": result.title,
            "authors": result.authors,
            "journal": result.journal,
            "year": result.year,
            "publisher": result.publisher,
            "citation_count": result.citation_count,
            "is_valid": result.is_valid,
        }}
    return {"source": "not_found", "data": None}


@router.get("/paper")
async def lookup_paper(doi: str = Query(...)):
    cached = cache_get(f"oa:{doi}", TTL_OPENALEX)
    if cached:
        return {"source": "cache", "data": cached}
    result = await oa_get(doi)
    if result:
        data = {
            "openalex_id": result.openalex_id,
            "doi": result.doi,
            "title": result.title,
            "publication_year": result.publication_year,
            "citation_count": result.citation_count,
        }
        cache_set(f"oa:{doi}", "openalex", data)
        return {"source": "openalex", "data": data}
    return {"source": "not_found", "data": None}


@router.post("/discover")
async def discover_papers(body: dict = Body(...)):
    """Search papers from OpenAlex + Semantic Scholar, dedup by DOI."""
    query = body.get("query", "").strip()
    limit = min(body.get("limit", 10), 50)
    if not query:
        return {"results": []}

    oa_results, s2_results = await asyncio.gather(
        oa_search(query, limit=limit),
        s2_search(query, limit=limit),
    )

    seen_dois: set[str] = set()
    results: list[dict] = []
    for r in oa_results:
        doi = (r.get("doi") or "").replace("https://doi.org/", "").lower()
        if doi and doi in seen_dois:
            continue
        if doi:
            seen_dois.add(doi)
        authors = [a.get("author", {}).get("display_name", "") for a in (r.get("authorships") or [])]
        loc = r.get("primary_location") or {}
        source = loc.get("source") or {}
        results.append({
            "source": "openalex",
            "doi": doi or "",
            "title": r.get("title", ""),
            "authors": authors,
            "year": r.get("publication_year"),
            "citation_count": r.get("cited_by_count", 0),
            "journal": source.get("display_name", ""),
            "abstract": "",
        })

    for p in s2_results:
        doi = ""
        if p.external_ids:
            doi = (p.external_ids.get("DOI") or "").lower()
        if doi and doi in seen_dois:
            continue
        if doi:
            seen_dois.add(doi)
        results.append({
            "source": "semantic_scholar",
            "doi": doi,
            "title": p.title,
            "authors": p.authors,
            "year": p.year,
            "citation_count": p.citation_count,
            "journal": p.venue or "",
            "abstract": p.abstract or "",
        })

    # Interleave results from both sources to preserve relevance ordering
    # (OpenAlex sorts by relevance by default when using ?search=)
    # (Semantic Scholar returns results in its own relevance order)
    interleaved: list[dict] = []
    oa_idx, s2_idx = 0, 0
    # Split results into source-specific lists preserving original order
    oa_list = [r for r in results if r["source"] == "openalex"]
    s2_list = [r for r in results if r["source"] == "semantic_scholar"]
    while oa_idx < len(oa_list) or s2_idx < len(s2_list):
        if oa_idx < len(oa_list):
            interleaved.append(oa_list[oa_idx])
            oa_idx += 1
        if s2_idx < len(s2_list):
            interleaved.append(s2_list[s2_idx])
            s2_idx += 1
    return {"results": interleaved}


@router.delete("/cache/{doi:path}")
async def invalidate_cache(doi: str):
    """Xoá cache cho DOI cụ thể, lần truy vấn sau sẽ fetch lại từ API."""
    cache_invalidate_doi(doi)
    logger.info(f"VERIFY_CACHE invalidated doi={doi}")
    return {"status": "ok", "doi": doi, "message": f"Đã xoá cache cho {doi}"}
