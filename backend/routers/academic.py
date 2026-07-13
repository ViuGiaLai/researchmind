"""
GET  /api/academic/doi          → tra DOI nhanh qua Crossref
GET  /api/academic/paper        → tra paper nhanh qua OpenAlex
POST /api/academic/discover     → search query qua OpenAlex + Semantic Scholar, trả JSON deduped
DELETE /api/academic/cache/{doi} → xoá cache cho DOI cụ thể
GET  /api/academic/pdf-proxy    → proxy PDF từ URL ngoài để xem trong iframe
POST /api/academic/translate    → translate all papers in results list via Gemini
"""
import asyncio
import ipaddress
import json
import socket
from urllib.parse import urljoin, urlparse
import httpx
from fastapi import APIRouter, Body, Query, HTTPException, Request
from fastapi.responses import Response
from loguru import logger

from common.i18n import get_language, get_output_language_name, t
from config.settings import settings

from academic.openalex import get_work_by_doi as oa_get, search_works as oa_search
from academic.crossref import get_work_by_doi as cr_get
from academic.semantic_scholar import search_papers as s2_search
from academic.cache import cache_get, cache_set, cache_invalidate_doi, TTL_OPENALEX, TTL_CROSSREF

router = APIRouter(prefix="/api/academic", tags=["academic"])

MAX_PDF_BYTES = 25 * 1024 * 1024
MAX_PDF_REDIRECTS = 3


async def _validate_public_pdf_url(url: str) -> None:
    """Reject malformed, local, and private-network URLs before fetching."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid PDF URL")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Credentialed URLs are not allowed")

    host = parsed.hostname
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            results = await asyncio.to_thread(socket.getaddrinfo, host, parsed.port or 443, type=socket.SOCK_STREAM)
            addresses = [ipaddress.ip_address(result[4][0]) for result in results]
        except (socket.gaierror, ValueError):
            raise HTTPException(status_code=400, detail="Unable to resolve PDF host")

    if not addresses or any(not address.is_global for address in addresses):
        raise HTTPException(status_code=400, detail="Private or local PDF hosts are not allowed")


async def _download_pdf(url: str) -> bytes:
    """Download a bounded PDF while validating every redirect target."""
    current_url = url
    headers = {"User-Agent": "ResearchMindVN/0.6"}
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        for _ in range(MAX_PDF_REDIRECTS + 1):
            await _validate_public_pdf_url(current_url)
            async with client.stream("GET", current_url, headers=headers) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise HTTPException(status_code=502, detail="PDF redirect has no location")
                    current_url = urljoin(current_url, location)
                    continue
                if response.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Failed to fetch PDF: HTTP {response.status_code}")

                content_length = response.headers.get("content-length")
                if content_length:
                    try:
                        if int(content_length) > MAX_PDF_BYTES:
                            raise HTTPException(status_code=413, detail="PDF exceeds the 25 MB limit")
                    except ValueError:
                        raise HTTPException(status_code=502, detail="Invalid PDF content length")
                content_type = response.headers.get("content-type", "").lower()
                if "application/pdf" not in content_type and "application/octet-stream" not in content_type:
                    raise HTTPException(status_code=415, detail="Remote resource is not a PDF")

                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > MAX_PDF_BYTES:
                        raise HTTPException(status_code=413, detail="PDF exceeds the 25 MB limit")
                if not chunks.startswith(b"%PDF-"):
                    raise HTTPException(status_code=415, detail="Remote resource is not a valid PDF")
                return bytes(chunks)
    raise HTTPException(status_code=502, detail="Too many PDF redirects")


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

    results: list[dict] = []
    for r in oa_results:
        authors = [a.get("author", {}).get("display_name", "") for a in (r.get("authorships") or [])]
        loc = r.get("primary_location") or {}
        source = loc.get("source") or {}
        # Reconstruct abstract from inverted index
        abstract_text = ""
        inv_index = r.get("abstract_inverted_index") or {}
        if inv_index:
            word_positions = []
            for word, positions in inv_index.items():
                for pos in positions:
                    word_positions.append((pos, word))
            word_positions.sort(key=lambda x: x[0])
            abstract_text = " ".join(wp[1] for wp in word_positions)
        # Get PDF URL from OpenAlex open_access
        oa_access = r.get("open_access") or {}
        oa_pdf_url = oa_access.get("oa_url", "") if oa_access.get("is_oa") else ""
        results.append({
            "source": "openalex",
            "doi": (r.get("doi") or "").replace("https://doi.org/", "").lower(),
            "title": r.get("title", ""),
            "authors": authors,
            "year": r.get("publication_year"),
            "citation_count": r.get("cited_by_count", 0),
            "journal": source.get("display_name", ""),
            "abstract": abstract_text,
            "openalex_id": r.get("id", ""),
            "pdf_url": oa_pdf_url,
        })

    for p in s2_results:
        doi = ""
        if p.external_ids:
            doi = (p.external_ids.get("DOI") or "").lower()
        results.append({
            "source": "semantic_scholar",
            "doi": doi,
            "title": p.title,
            "authors": p.authors,
            "year": p.year,
            "citation_count": p.citation_count,
            "journal": p.venue or "",
            "abstract": p.abstract or "",
            "s2_paper_id": p.paper_id,
            "pdf_url": p.open_access_pdf_url or "",
        })

    # Interleave results: one from each source at a time to keep both visible
    oa_only = [r for r in results if r["source"] == "openalex"]
    s2_only = [r for r in results if r["source"] == "semantic_scholar"]
    interleaved: list[dict] = []
    oa_i, s2_i = 0, 0
    while oa_i < len(oa_only) or s2_i < len(s2_only):
        if oa_i < len(oa_only):
            interleaved.append(oa_only[oa_i])
            oa_i += 1
        if s2_i < len(s2_only):
            interleaved.append(s2_only[s2_i])
            s2_i += 1
    return {"results": interleaved}


@router.get("/pdf-proxy")
async def proxy_pdf(url: str = Query(..., description="PDF URL to proxy")):
    """Proxy PDF from external URL to bypass CORS/X-Frame-Options for iframe viewing."""
    try:
        content = await _download_pdf(url)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline", "Cache-Control": "private, max-age=3600"},
        )
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout fetching PDF")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Error fetching PDF: {str(e)}")


@router.post("/translate")
async def translate_papers(request: Request, body: dict = Body(...)):
    """Translate discovery result titles and abstracts from English to Vietnamese via Gemini."""
    papers = body.get("papers", [])
    if not papers:
        return {"translations": []}

    lang = get_language(request)

    api_key = settings.gemini_translate_api_key or settings.gemini_api_key
    if not api_key:
        raise HTTPException(status_code=400, detail="Missing Gemini API key. Set GEMINI_TRANSLATE_API_KEY or GEMINI_API_KEY in .env")

    system_prompt = (
        f"Bạn là chuyên gia dịch thuật học thuật. Dịch từ tiếng Anh sang {get_output_language_name(lang)}. "
        f"Dịch title và abstract từ tiếng Anh sang {get_output_language_name(lang)}. "
        "Giữ nguyên: tên tác giả, tên tạp chí, DOI, số liệu, thuật ngữ kỹ thuật (RAG, GraphRAG, LLM, Transformer, GAN, v.v.). "
        "Chỉ trả về JSON, không thêm giải thích."
    )

    translate_model = settings.gemini_translate_model or "gemini-2.5-flash"
    fallback_model = settings.gemini_model or "gemini-2.5-flash"
    model_candidates = [translate_model]
    if fallback_model not in model_candidates:
        model_candidates.append(fallback_model)

    def _chunk_papers(items: list[dict], size: int) -> list[list[dict]]:
        return [items[i:i + size] for i in range(0, len(items), size)]

    def _build_batch_payload(batch: list[dict], model_name: str) -> tuple[str, dict]:
        prompt = json.dumps(batch, ensure_ascii=False)
        user_prompt = f"Dịch các title và abstract sau sang {get_output_language_name(lang)}:\n\n{prompt}"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json",
            },
        }
        return url, payload

    batch = []
    for p in papers:
        title = (p.get("title") or "").strip()
        abstract = (p.get("abstract") or "").strip()
        batch.append({"title": title, "abstract": abstract})

    headers = {"Content-Type": "application/json"}
    result = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        for chunk in _chunk_papers(batch, 6):
            data = None
            last_error: Exception | None = None
            for model in model_candidates:
                url, payload = _build_batch_payload(chunk, model)
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except httpx.TimeoutException as e:
                    raise HTTPException(status_code=504, detail="Gemini API timeout") from e
                except httpx.HTTPStatusError as e:
                    last_error = e
                    body = e.response.text[:500].replace("\n", " ")
                    logger.warning(
                        f"Gemini translate failed: model={model} status={e.response.status_code} body={body}"
                    )
                    if model != model_candidates[-1]:
                        continue
                    raise HTTPException(
                        status_code=502,
                        detail=f"Gemini API returned HTTP {e.response.status_code}: {body}",
                    ) from e
                except httpx.RequestError as e:
                    last_error = e
                    logger.warning(f"Gemini translate request error: model={model} error={e}")
                    if model != model_candidates[-1]:
                        continue
                    raise HTTPException(status_code=502, detail=f"Gemini API error: {e}") from e

            if data is None:
                raise HTTPException(status_code=502, detail=f"Gemini translation failed: {last_error}")

            candidates = data.get("candidates", [])
            if not candidates:
                raise HTTPException(status_code=502, detail="Gemini returned no candidates")

            raw = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    translations = parsed
                else:
                    translations = parsed.get("translations", [])
            except json.JSONDecodeError:
                logger.warning(f"Gemini translate: failed to parse JSON, raw={raw[:200]}")
                raise HTTPException(status_code=502, detail="Gemini returned invalid JSON")

            for i, _paper in enumerate(chunk):
                t = translations[i] if i < len(translations) else {}
                result.append({
                    "title_vi": t.get("title_vi") or t.get("title") or "",
                    "abstract_vi": t.get("abstract_vi") or t.get("abstract") or "",
                })

    return {"translations": result}


@router.delete("/cache/{doi:path}")
async def invalidate_cache(doi: str, request: Request):
    """Xoá cache cho DOI cụ thể, lần truy vấn sau sẽ fetch lại từ API."""
    lang = get_language(request)
    cache_invalidate_doi(doi)
    logger.info(f"VERIFY_CACHE invalidated doi={doi}")
    return {"status": "ok", "doi": doi, "message": t("academic.cache_cleared", lang, doi=doi)}
