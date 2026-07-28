import asyncio
from types import SimpleNamespace

from academic import external_search


def _clear_state():
    external_search._search_cache.clear()
    external_search._inflight_searches.clear()


def test_external_search_caches_and_coalesces_identical_requests(monkeypatch):
    _clear_state()
    calls = {"openalex": 0, "s2": 0, "web": 0}

    async def openalex(_query, limit):
        calls["openalex"] += 1
        await asyncio.sleep(0)
        return [{"title": "Grounded Study", "publication_year": 2025}]

    async def semantic(_query, limit):
        calls["s2"] += 1
        await asyncio.sleep(0)
        return []

    async def web(_query, max_results):
        calls["web"] += 1
        await asyncio.sleep(0)
        return []

    monkeypatch.setattr(external_search, "search_works", openalex)
    monkeypatch.setattr(external_search, "search_papers", semantic)
    monkeypatch.setattr(external_search, "search_web", web)

    async def run():
        first, second = await asyncio.gather(
            external_search.search_external("same query", 5),
            external_search.search_external("same query", 5),
        )
        third = await external_search.search_external("same query", 5)
        return first, second, third

    first, second, third = asyncio.run(run())
    assert first == second == third
    assert calls == {"openalex": 1, "s2": 1, "web": 1}


def test_external_search_keeps_partial_academic_results_and_identifiers(monkeypatch):
    _clear_state()

    async def failing_openalex(_query, limit):
        raise TimeoutError("source unavailable")

    async def semantic(_query, limit):
        return [
            SimpleNamespace(
                title="Verified Paper",
                year=2024,
                citation_count=12,
                authors=["A. Author"],
                venue="Journal",
                external_ids={"DOI": "10.1000/test"},
                url="https://example.test/paper",
                abstract="Evidence-based abstract.",
            )
        ]

    async def web(_query, max_results):
        return []

    monkeypatch.setattr(external_search, "search_works", failing_openalex)
    monkeypatch.setattr(external_search, "search_papers", semantic)
    monkeypatch.setattr(external_search, "search_web", web)

    result = asyncio.run(external_search.search_external("partial sources", 5))
    assert "Verified Paper" in result
    assert "https://doi.org/10.1000/test" in result
