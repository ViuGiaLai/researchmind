"""
GET  /api/academic/doi          → tra DOI nhanh qua Crossref
GET  /api/academic/paper        → tra paper nhanh qua OpenAlex
DELETE /api/academic/cache/{doi} → xoá cache cho DOI cụ thể
Dùng cho LibraryView: hiển thị citation count bên cạnh paper.
"""
from fastapi import APIRouter, Query
from loguru import logger

from academic.openalex import get_work_by_doi as oa_get
from academic.crossref import get_work_by_doi as cr_get
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


@router.delete("/cache/{doi:path}")
async def invalidate_cache(doi: str):
    """Xoá cache cho DOI cụ thể, lần truy vấn sau sẽ fetch lại từ API."""
    cache_invalidate_doi(doi)
    logger.info(f"VERIFY_CACHE invalidated doi={doi}")
    return {"status": "ok", "doi": doi, "message": f"Đã xoá cache cho {doi}"}
