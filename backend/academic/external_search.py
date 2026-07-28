import asyncio
import time
from collections import OrderedDict

from academic.openalex import search_works
from academic.semantic_scholar import search_papers
from academic.web_search import search_web

_CACHE_TTL_SECONDS = 300.0
_CACHE_MAX_ENTRIES = 64
_search_cache: OrderedDict[tuple[str, int], tuple[float, str]] = OrderedDict()
_inflight_searches: dict[tuple[str, int], asyncio.Task[str]] = {}


def _format_openalex_results(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["## OpenAlex academic results"]
    for r in results:
        title = r.get("title", "Untitled")
        year = r.get("publication_year", "N/A")
        citations = r.get("cited_by_count", 0)
        doi = r.get("doi", "")
        loc = r.get("primary_location") or {}
        source = loc.get("source") or {}
        journal = source.get("display_name", "Unknown")
        authors = r.get("authorships", [])
        author_names = [a.get("author", {}).get("display_name", "") for a in authors[:3]]
        author_str = ", ".join(filter(None, author_names))
        lines.append(f"- **{title}** ({year}) - {citations} citations")
        if author_str:
            lines.append(f"  Authors: {author_str}")
        lines.append(f"  Source: {journal}")
        if doi:
            lines.append(f"  DOI: {doi}")
    return "\n".join(lines)


def _format_s2_results(results: list) -> str:
    if not results:
        return ""
    lines = ["## Semantic Scholar academic results"]
    for p in results:
        authors = ", ".join(p.authors[:3]) if p.authors else "N/A"
        lines.append(f"- **{p.title}** ({p.year or 'N/A'}) - {p.citation_count} citations")
        lines.append(f"  Authors: {authors}")
        if p.venue:
            lines.append(f"  Venue: {p.venue}")
        doi = (p.external_ids or {}).get("DOI")
        if doi:
            lines.append(f"  DOI: https://doi.org/{doi}")
        elif p.url:
            lines.append(f"  URL: {p.url}")
        if p.abstract:
            abstract = p.abstract[:200] + "..." if len(p.abstract) > 200 else p.abstract
            lines.append(f"  Abstract: {abstract}")
    return "\n".join(lines)


def _format_web_results(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["## Web results"]
    for r in results:
        lines.append(f"- **{r['title']}**")
        lines.append(f"  {r['snippet']}")
        lines.append(f"  URL: {r['url']}")
    return "\n".join(lines)


async def _fetch_external(query: str, top_k: int) -> str:
    results = await asyncio.gather(
        search_works(query, limit=top_k),
        search_papers(query, limit=top_k),
        search_web(query, max_results=top_k),
        return_exceptions=True,
    )
    oa_results = [] if isinstance(results[0], Exception) else results[0]
    s2_results = [] if isinstance(results[1], Exception) else results[1]
    web_results = [] if isinstance(results[2], Exception) else results[2]

    parts = [
        "The following information comes from external sources:\n",
    ]

    oa_formatted = _format_openalex_results(oa_results)
    if oa_formatted:
        parts.append(oa_formatted)
        parts.append("")

    s2_formatted = _format_s2_results(s2_results)
    if s2_formatted:
        parts.append(s2_formatted)
        parts.append("")

    web_formatted = _format_web_results(web_results)
    if web_formatted:
        parts.append(web_formatted)
        parts.append("")

    if len(parts) == 1:
        return ""
    return "\n".join(parts).strip()


async def search_external(query: str, top_k: int = 5) -> str:
    """Search academic sources concurrently, coalescing duplicate requests."""
    cache_key = (query.strip().casefold(), top_k)
    now = time.monotonic()
    cached = _search_cache.get(cache_key)
    if cached and now - cached[0] <= _CACHE_TTL_SECONDS:
        _search_cache.move_to_end(cache_key)
        return cached[1]
    if cached:
        _search_cache.pop(cache_key, None)

    task = _inflight_searches.get(cache_key)
    if task is None:
        task = asyncio.create_task(_fetch_external(query, top_k))
        _inflight_searches[cache_key] = task

    try:
        result = await asyncio.shield(task)
    finally:
        if _inflight_searches.get(cache_key) is task:
            _inflight_searches.pop(cache_key, None)

    _search_cache[cache_key] = (time.monotonic(), result)
    _search_cache.move_to_end(cache_key)
    while len(_search_cache) > _CACHE_MAX_ENTRIES:
        _search_cache.popitem(last=False)
    return result
