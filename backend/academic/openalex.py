"""
OpenAlex API client — không cần API key, rate limit 100k/ngày.
Polite pool: thêm email vào header để tăng rate limit.
"""

from dataclasses import dataclass

import httpx

OPENALEX_BASE = "https://api.openalex.org"
POLITE_EMAIL = "worksor.78@gmail.com"

HEADERS = {"User-Agent": f"ResearchMindVN/0.3 (mailto:{POLITE_EMAIL})"}


@dataclass
class OpenAlexWork:
    openalex_id: str
    doi: str | None
    title: str
    publication_year: int | None
    citation_count: int
    related_work_ids: list[str]
    referenced_work_ids: list[str]
    recent_citing_works: list[dict]


@dataclass
class OpenAlexResult:
    """Lightweight result for search_openalex — used by KnowledgeEngine & LiteratureEngine."""

    id: str
    doi: str | None
    title: str
    abstract: str | None
    authors: list[str]
    year: int | None
    primary_url: str | None
    cited_by_count: int
    fwci: float | None
    concepts: list[dict]


async def get_work_by_doi(doi: str, timeout: float = 5.0) -> OpenAlexWork | None:
    doi_clean = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(f"{OPENALEX_BASE}/works/doi:{doi_clean}", headers=HEADERS)
            if resp.status_code != 200:
                return None
            data = resp.json()
            return _parse_work(data)
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def get_work_by_title(title: str, timeout: float = 5.0) -> OpenAlexWork | None:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={"filter": f"title.search:{title}", "per_page": 1, "sort": "relevance_score:desc"},
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return None
            results = resp.json().get("results", [])
            if not results:
                return None
            return _parse_work(results[0])
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def search_works(query: str, limit: int = 5, timeout: float = 5.0) -> list[dict]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "search": query,
                    "per_page": limit,
                    "select": "id,doi,title,publication_year,cited_by_count,authorships,primary_location,abstract_inverted_index,relevance_score,open_access,fwci,concepts",
                },
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return []
            return resp.json().get("results", [])
        except (httpx.TimeoutException, httpx.RequestError):
            return []


async def get_recent_citing_works(
    openalex_id: str, since_year: int = 2022, limit: int = 5, timeout: float = 5.0
) -> list[dict]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "filter": f"cites:{openalex_id},publication_year:>{since_year}",
                    "per_page": limit,
                    "sort": "publication_date:desc",
                    "select": "id,doi,title,publication_year,authorships,primary_location",
                },
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return []
            return resp.json().get("results", [])
        except (httpx.TimeoutException, httpx.RequestError):
            return []


def _decode_abstract(inverted_index: dict | None) -> str | None:
    """Decode OpenAlex inverted index abstract into plain text."""
    if not inverted_index:
        return None
    try:
        word_positions = []
        for word, positions in inverted_index.items():
            for pos in positions:
                word_positions.append((pos, word))
        word_positions.sort(key=lambda x: x[0])
        return " ".join(wp[1] for wp in word_positions)
    except Exception:
        return None


def search_openalex(query: str, limit: int = 5) -> list[OpenAlexResult]:
    """Synchronous search OpenAlex — returns OpenAlexResult objects with full metadata.

    Used by KnowledgeEngine (sync context builder) and LiteratureEngine (sync search).
    """
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "search": query,
                    "per_page": limit,
                    "select": "id,doi,title,publication_year,cited_by_count,authorships,primary_location,abstract_inverted_index,open_access,fwci,concepts",
                },
                headers=HEADERS,
            )
            if resp.status_code != 200:
                return []
            results = resp.json().get("results", [])
            parsed: list[OpenAlexResult] = []
            for item in results:
                authors = []
                for a in item.get("authorships", []):
                    name = a.get("author", {}).get("display_name", "")
                    if name:
                        authors.append(name)
                primary_loc = item.get("primary_location")
                url = None
                if primary_loc and isinstance(primary_loc, dict):
                    url = primary_loc.get("landing_page_url") or primary_loc.get("pdf_url")
                doi = item.get("doi")
                parsed.append(
                    OpenAlexResult(
                        id=item.get("id", ""),
                        doi=doi,
                        title=item.get("title", ""),
                        abstract=_decode_abstract(item.get("abstract_inverted_index")),
                        authors=authors,
                        year=item.get("publication_year"),
                        primary_url=url,
                        cited_by_count=item.get("cited_by_count", 0),
                        fwci=item.get("fwci"),
                        concepts=item.get("concepts", []),
                    )
                )
            return parsed
    except httpx.RequestError:
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
        recent_citing_works=[],
    )
