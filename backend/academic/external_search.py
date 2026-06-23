import asyncio
from academic.openalex import search_works
from academic.semantic_scholar import search_papers
from academic.web_search import search_web
from typing import Optional


def _format_openalex_results(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["## Kết quả từ OpenAlex (học thuật)"]
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
        lines.append(f"- **{title}** ({year}) - {citations} trích dẫn")
        if author_str:
            lines.append(f"  Tác giả: {author_str}")
        lines.append(f"  Nguồn: {journal}")
        if doi:
            lines.append(f"  DOI: {doi}")
    return "\n".join(lines)


def _format_s2_results(results: list) -> str:
    if not results:
        return ""
    lines = ["## Kết quả từ Semantic Scholar (học thuật)"]
    for p in results:
        authors = ", ".join(p.authors[:3]) if p.authors else "N/A"
        lines.append(f"- **{p.title}** ({p.year or 'N/A'}) - {p.citation_count} trích dẫn")
        lines.append(f"  Tác giả: {authors}")
        if p.venue:
            lines.append(f"  Nơi đăng: {p.venue}")
        if p.abstract:
            abstract = p.abstract[:200] + "..." if len(p.abstract) > 200 else p.abstract
            lines.append(f"  Tóm tắt: {abstract}")
    return "\n".join(lines)


def _format_web_results(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["## Kết quả từ Web"]
    for r in results:
        lines.append(f"- **{r['title']}**")
        lines.append(f"  {r['snippet']}")
        lines.append(f"  URL: {r['url']}")
    return "\n".join(lines)


async def search_external(query: str, top_k: int = 5) -> str:
    oa_results, s2_results, web_results = await asyncio.gather(
        search_works(query, limit=top_k),
        search_papers(query, limit=top_k),
        search_web(query, max_results=top_k),
    )

    parts = [
        "Dưới đây là thông tin từ các nguồn bên ngoài:\n",
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

    return "\n".join(parts).strip()
