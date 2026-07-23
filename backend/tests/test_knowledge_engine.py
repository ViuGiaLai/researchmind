import asyncio
import threading
from types import SimpleNamespace

import pytest

import academic.knowledge_engine as knowledge_module
from academic.knowledge_engine import KnowledgeEngine


def _semantic_paper():
    return SimpleNamespace(
        paper_id="s2-paper",
        citation_count=42,
        influential_citation_count=7,
        venue="TestConf",
        year=2025,
        url="https://example.test/s2",
        fields_of_study=["Computer Science"],
    )


def _openalex_paper():
    return SimpleNamespace(
        id="openalex-paper",
        cited_by_count=40,
        fwci=2.5,
        concepts=[{"display_name": "Retrieval"}],
    )


@pytest.mark.asyncio
async def test_provider_requests_run_concurrently(monkeypatch):
    started: set[str] = set()
    lock = threading.Lock()
    all_started = threading.Event()

    def mark_started(provider: str) -> None:
        with lock:
            started.add(provider)
            if len(started) == 3:
                all_started.set()

    async def get_by_doi(_doi: str):
        mark_started("semantic_scholar")
        completed = await asyncio.to_thread(all_started.wait, 0.5)
        assert completed, "provider requests did not overlap"
        return _semantic_paper()

    def search_openalex(_title: str, _limit: int):
        mark_started("openalex")
        assert all_started.wait(0.5), "provider requests did not overlap"
        return [_openalex_paper()]

    def search_paperswithcode(_title: str):
        mark_started("paperswithcode")
        assert all_started.wait(0.5), "provider requests did not overlap"
        return [{"paper": "benchmark"}]

    monkeypatch.setattr(knowledge_module, "get_paper_by_doi", get_by_doi)
    monkeypatch.setattr(knowledge_module, "search_openalex", search_openalex)
    monkeypatch.setattr(knowledge_module, "search_paper_results", search_paperswithcode)

    result = await KnowledgeEngine().get_paper_knowledge("Concurrent paper", "10.1/test")

    assert result["semantic_scholar"]["paper_id"] == "s2-paper"
    assert result["openalex"]["id"] == "openalex-paper"
    assert result["paperswithcode"] == [{"paper": "benchmark"}]


@pytest.mark.asyncio
async def test_provider_failure_is_isolated(monkeypatch):
    async def get_by_doi(_doi: str):
        raise RuntimeError("S2 unavailable")

    def search_openalex(_title: str, _limit: int):
        return [_openalex_paper()]

    def search_paperswithcode(_title: str):
        return [{"paper": "benchmark"}]

    monkeypatch.setattr(knowledge_module, "get_paper_by_doi", get_by_doi)
    monkeypatch.setattr(knowledge_module, "search_openalex", search_openalex)
    monkeypatch.setattr(knowledge_module, "search_paper_results", search_paperswithcode)

    result = await KnowledgeEngine().get_paper_knowledge("Resilient paper", "10.1/test")

    assert result["semantic_scholar"] is None
    assert result["openalex"]["id"] == "openalex-paper"
    assert result["paperswithcode"] == [{"paper": "benchmark"}]
