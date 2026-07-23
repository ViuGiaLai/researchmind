"""
Semantic Scholar API client — free, no key required (rate limit ~100 req/sec).
Cung cấp: paper search, citations, recommendations, related works.
"""

from dataclasses import dataclass

import httpx

S2_BASE = "https://api.semanticscholar.org/graph/v1"
HEADERS = {"User-Agent": "ResearchMindVN/0.3 (mailto:worksor.78@gmail.com)"}


@dataclass
class S2Paper:
    paper_id: str
    title: str
    year: int | None
    citation_count: int
    influential_citation_count: int
    authors: list[str]
    external_ids: dict
    abstract: str | None
    venue: str | None
    citation_stats: dict | None = None
    is_open_access: bool = False
    open_access_pdf_url: str | None = None
    url: str | None = None
    fields_of_study: list[str] | None = None


async def search_papers(
    query: str,
    limit: int = 10,
    fields: str = "title,year,citationCount,influentialCitationCount,authors,externalIds,abstract,venue,isOpenAccess,openAccessPdf",
) -> list[S2Paper]:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{S2_BASE}/paper/search",
                params={"query": query, "limit": limit, "fields": fields},
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return []
            results = resp.json().get("data", [])
            return [_parse_paper(p) for p in results]
        except (httpx.TimeoutException, httpx.RequestError):
            return []


async def get_paper_by_id(s2_id: str, timeout: float = 5.0) -> S2Paper | None:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{S2_BASE}/paper/{s2_id}",
                params={"fields": "title,year,citationCount,influentialCitationCount,authors,externalIds,abstract,venue"},
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return None
            return _parse_paper(resp.json())
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def get_paper_by_doi(doi: str, timeout: float = 5.0) -> S2Paper | None:
    doi_clean = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{S2_BASE}/paper/DOI:{doi_clean}",
                params={"fields": "title,year,citationCount,influentialCitationCount,authors,externalIds,abstract,venue,citationStyles"},
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return None
            return _parse_paper(resp.json())
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def get_citations(
    s2_id: str,
    limit: int = 20,
    offset: int = 0,
    timeout: float = 10.0,
) -> list[S2Paper]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{S2_BASE}/paper/{s2_id}/citations",
                params={
                    "limit": min(limit, 100),
                    "offset": offset,
                    "fields": "title,year,citationCount,influentialCitationCount,authors,externalIds",
                },
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return []
            results = resp.json().get("data", [])
            return [_parse_citing_paper(c) for c in results if "citingPaper" in c]
        except (httpx.TimeoutException, httpx.RequestError):
            return []


async def get_references(
    s2_id: str,
    limit: int = 20,
    timeout: float = 10.0,
) -> list[S2Paper]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{S2_BASE}/paper/{s2_id}/references",
                params={
                    "limit": min(limit, 100),
                    "fields": "title,year,citationCount,influentialCitationCount,authors,externalIds",
                },
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return []
            results = resp.json().get("data", [])
            return [_parse_citing_paper(c, key="citedPaper") for c in results if "citedPaper" in c]
        except (httpx.TimeoutException, httpx.RequestError):
            return []


async def get_recommendations(
    s2_id: str,
    limit: int = 10,
    timeout: float = 10.0,
) -> list[S2Paper]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{S2_BASE}/recommendations/v1/papers/{s2_id}",
                params={"limit": min(limit, 100)},
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return []
            results = resp.json().get("recommendedPapers", [])
            return [_parse_paper(p) for p in results]
        except (httpx.TimeoutException, httpx.RequestError):
            return []


async def get_batch_papers(
    s2_ids: list[str], timeout: float = 15.0
) -> list[S2Paper | None]:
    async with httpx.AsyncClient(timeout=timeout):
        results = []
        for s2_id in s2_ids:
            paper = await get_paper_by_id(s2_id)
            results.append(paper)
        return results


def _parse_paper(data: dict) -> S2Paper:
    authors = []
    for a in data.get("authors", []):
        name = a.get("name", "")
        if name:
            authors.append(name)
    oa_pdf = data.get("openAccessPdf") or {}
    paper_id = data.get("paperId", "")
    return S2Paper(
        paper_id=paper_id,
        title=data.get("title", ""),
        year=data.get("year"),
        citation_count=data.get("citationCount", 0),
        influential_citation_count=data.get("influentialCitationCount", 0),
        authors=authors,
        external_ids=data.get("externalIds", {}),
        abstract=data.get("abstract"),
        venue=data.get("venue"),
        is_open_access=data.get("isOpenAccess", False),
        open_access_pdf_url=oa_pdf.get("url"),
        url=f"https://www.semanticscholar.org/paper/{paper_id}" if paper_id else None,
        fields_of_study=data.get("fieldsOfStudy", []),
    )


def _parse_citing_paper(data: dict, key: str = "citingPaper") -> S2Paper | None:
    paper = data.get(key)
    if not paper:
        return None
    authors = []
    for a in paper.get("authors", []):
        name = a.get("name", "")
        if name:
            authors.append(name)
    return S2Paper(
        paper_id=paper.get("paperId", ""),
        title=paper.get("title", ""),
        year=paper.get("year"),
        citation_count=paper.get("citationCount", 0),
        influential_citation_count=paper.get("influentialCitationCount", 0),
        authors=authors,
        external_ids=paper.get("externalIds", {}),
        abstract=None,
        venue=None,
    )
