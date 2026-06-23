"""
OpenAlex API client — không cần API key, rate limit 100k/ngày.
Polite pool: thêm email vào header để tăng rate limit.
"""
import httpx
from dataclasses import dataclass
from typing import Optional

OPENALEX_BASE = "https://api.openalex.org"
POLITE_EMAIL = "worksor.78@gmail.com"

HEADERS = {
    "User-Agent": f"ResearchMindVN/0.3 (mailto:{POLITE_EMAIL})"
}


@dataclass
class OpenAlexWork:
    openalex_id: str
    doi: Optional[str]
    title: str
    publication_year: Optional[int]
    citation_count: int
    related_work_ids: list[str]
    referenced_work_ids: list[str]
    recent_citing_works: list[dict]


async def get_work_by_doi(doi: str, timeout: float = 5.0) -> Optional[OpenAlexWork]:
    doi_clean = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works/doi:{doi_clean}",
                headers=HEADERS
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            return _parse_work(data)
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def get_work_by_title(title: str, timeout: float = 5.0) -> Optional[OpenAlexWork]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "filter": f"title.search:{title}",
                    "per_page": 1,
                    "sort": "relevance_score:desc"
                },
                headers=HEADERS
            )
            if resp.status_code != 200:
                return None
            results = resp.json().get("results", [])
            if not results:
                return None
            return _parse_work(results[0])
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def search_works(
    query: str,
    limit: int = 5,
    timeout: float = 5.0
) -> list[dict]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "search": query,
                    "per_page": limit,
                    "sort": "cited_by_count:desc",
                    "select": "id,doi,title,publication_year,cited_by_count,authorships,primary_location,abstract_inverted_index"
                },
                headers=HEADERS
            )
            if resp.status_code != 200:
                return []
            return resp.json().get("results", [])
        except (httpx.TimeoutException, httpx.RequestError):
            return []


async def get_recent_citing_works(
    openalex_id: str,
    since_year: int = 2022,
    limit: int = 5,
    timeout: float = 5.0
) -> list[dict]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "filter": f"cites:{openalex_id},publication_year:>{since_year}",
                    "per_page": limit,
                    "sort": "publication_date:desc",
                    "select": "id,doi,title,publication_year,authorships,primary_location"
                },
                headers=HEADERS
            )
            if resp.status_code != 200:
                return []
            return resp.json().get("results", [])
        except (httpx.TimeoutException, httpx.RequestError):
            return []


def _parse_work(data: dict) -> OpenAlexWork:
    return OpenAlexWork(
        openalex_id=data.get("id", ""),
        doi=data.get("doi"),
        title=data.get("title", ""),
        publication_year=data.get("publication_year"),
        citation_count=data.get("cited_by_count", 0),
        related_work_ids=data.get("related_works", []),
        referenced_work_ids=data.get("referenced_works", []),
        recent_citing_works=[]
    )
