"""
Crossref API client — miễn phí, polite pool với email.
Dùng để: validate DOI, lấy metadata chuẩn (author, journal, year).
"""
from dataclasses import dataclass

import httpx

CROSSREF_BASE = "https://api.crossref.org"
POLITE_EMAIL = "worksor.78@gmail.com"

HEADERS = {
    "User-Agent": f"ResearchMindVN/0.3 (mailto:{POLITE_EMAIL})"
}


@dataclass
class CrossrefWork:
    doi: str
    title: str
    authors: list[str]
    journal: str | None
    year: int | None
    publisher: str | None
    citation_count: int
    is_valid: bool


async def get_work_by_doi(doi: str, timeout: float = 5.0) -> CrossrefWork | None:
    doi_clean = doi.replace("https://doi.org/", "").strip()

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{CROSSREF_BASE}/works/{doi_clean}",
                headers=HEADERS
            )
            if resp.status_code == 404:
                return CrossrefWork(
                    doi=doi_clean, title="", authors=[], journal=None,
                    year=None, publisher=None, citation_count=0, is_valid=False
                )
            if resp.status_code != 200:
                return None

            item = resp.json().get("message", {})
            return _parse_item(item)
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def find_doi_by_title(title: str, authors: list[str] = None, timeout: float = 5.0) -> str | None:
    query = title
    if authors:
        query += " " + " ".join(authors[:2])

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{CROSSREF_BASE}/works",
                params={"query": query, "rows": 1, "select": "DOI,score,title"},
                headers=HEADERS
            )
            if resp.status_code != 200:
                return None

            items = resp.json().get("message", {}).get("items", [])
            if not items:
                return None

            top = items[0]
            if top.get("score", 0) >= 40.0:
                return top.get("DOI")
            return None
        except (httpx.TimeoutException, httpx.RequestError):
            return None


def _parse_item(item: dict) -> CrossrefWork:
    authors = []
    for auth in item.get("author", []):
        given = auth.get("given", "")
        family = auth.get("family", "")
        name = f"{given} {family}".strip()
        if name:
            authors.append(name)

    container = item.get("container-title", [])
    journal = container[0] if container else None

    year = None
    date_parts = item.get("published", {}).get("date-parts", [[]])
    if date_parts and date_parts[0]:
        year = date_parts[0][0]

    titles = item.get("title", [])
    title = titles[0] if titles else ""

    return CrossrefWork(
        doi=item.get("DOI", ""),
        title=title,
        authors=authors,
        journal=journal,
        year=year,
        publisher=item.get("publisher"),
        citation_count=item.get("is-referenced-by-count", 0),
        is_valid=True
    )
