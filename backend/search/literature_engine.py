"""
ResearchMind VN — Public Literature Semantic Search Engine.

Searches across millions of public academic papers (arXiv, OpenAlex, Semantic Scholar, CrossRef)
with semantic query expansion, deduplication, and citation synthesis.
"""

import urllib.parse
import urllib.request
from typing import Any

try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger("literature_engine")
from academic.openalex import search_openalex
from academic.semantic_scholar import search_papers as s2_search


def search_arxiv(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    """Search arXiv public papers API."""
    url = f"http://export.arxiv.org/api/query?search_query=all:{urllib.parse.quote(query)}&start=0&max_results={max_results}"
    results = []
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ResearchMind/0.6.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                xml_data = resp.read().decode("utf-8")
                import xml.etree.ElementTree as ET
                root = ET.fromstring(xml_data)
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                for entry in root.findall("atom:entry", ns):
                    title_elem = entry.find("atom:title", ns)
                    summary_elem = entry.find("atom:summary", ns)
                    id_elem = entry.find("atom:id", ns)
                    published_elem = entry.find("atom:published", ns)

                    authors = [a.find("atom:name", ns).text for a in entry.findall("atom:author", ns) if a.find("atom:name", ns) is not None]

                    title = title_elem.text.strip().replace("\n", " ") if title_elem is not None and title_elem.text else ""
                    summary = summary_elem.text.strip().replace("\n", " ") if summary_elem is not None and summary_elem.text else ""
                    arxiv_id = id_elem.text.split("/")[-1] if id_elem is not None and id_elem.text else ""
                    year = published_elem.text[:4] if published_elem is not None and published_elem.text else ""

                    if title:
                        results.append({
                            "source": "arxiv",
                            "title": title,
                            "abstract": summary,
                            "authors": authors,
                            "year": year,
                            "doi": f"10.48550/arXiv.{arxiv_id}" if arxiv_id else "",
                            "url": f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "",
                            "citations": None,
                        })
    except Exception as e:
        logger.warning(f"arXiv search error: {e}")
    return results


async def search_public_literature(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Hybrid Public Literature Discovery (arXiv + OpenAlex + Semantic Scholar async)."""
    items: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    seen_dois: set[str] = set()

    def _normalize(t: str) -> str:
        return "".join(c.lower() for c in t if c.isalnum())

    # 1. arXiv
    arxiv_items = search_arxiv(query, max_results=limit // 2)
    for it in arxiv_items:
        norm = _normalize(it["title"])
        if norm and norm not in seen_titles:
            seen_titles.add(norm)
            items.append(it)

    # 2. OpenAlex
    try:
        oa_items = search_openalex(query, limit=limit // 2)
        for oa in oa_items:
            norm = _normalize(oa.title)
            doi = oa.doi.lower() if oa.doi else ""
            if (doi and doi in seen_dois) or (norm and norm in seen_titles):
                continue
            if doi:
                seen_dois.add(doi)
            if norm:
                seen_titles.add(norm)
            items.append({
                "source": "openalex",
                "title": oa.title,
                "abstract": oa.abstract or "",
                "authors": oa.authors or [],
                "year": str(oa.year) if oa.year else "",
                "doi": oa.doi or "",
                "url": oa.primary_url or (f"https://doi.org/{oa.doi}" if oa.doi else ""),
                "citations": oa.cited_by_count,
            })
    except Exception as e:
        logger.warning(f"Literature Engine OpenAlex error: {e}")

    # 3. Semantic Scholar
    try:
        s2_items = await s2_search(query, limit=limit // 2)
        for s2 in s2_items:
            norm = _normalize(s2.title)
            if norm and norm not in seen_titles:
                seen_titles.add(norm)
                items.append({
                    "source": "semantic_scholar",
                    "title": s2.title,
                    "abstract": s2.abstract or "",
                    "authors": s2.authors or [],
                    "year": str(s2.year) if s2.year else "",
                    "doi": s2.paper_id,
                    "url": s2.url or f"https://www.semanticscholar.org/paper/{s2.paper_id}",
                    "citations": s2.citation_count,
                })
    except Exception as e:
        logger.warning(f"Literature Engine S2 error: {e}")

    return items[:limit]
