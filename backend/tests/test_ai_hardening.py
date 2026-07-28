from types import SimpleNamespace

from chat.generator_v2 import Generator
from chat.retriever import Retriever
from config.settings import settings
from routers.chat import _build_chunk_map, _chat_cache_key, _process_citations


def test_chat_cache_key_isolated_by_language_and_modes():
    base = _chat_cache_key("same question", ["b", "a"], "current", None)
    assert base == _chat_cache_key("same question", ["a", "b"], "current", None)
    assert base != _chat_cache_key("same question", ["a", "b"], "current", None, language="vi")
    assert base != _chat_cache_key("same question", ["a", "b"], "current", None, reasoning_mode="deep")
    assert base != _chat_cache_key("same question", ["a", "b"], "current", None, strict_evidence=True)


def test_retriever_interleaves_papers_and_keeps_chunk_order():
    retriever = object.__new__(Retriever)
    chunks = [
        {"paper_id": "a", "chunk_index": 2},
        {"paper_id": "a", "chunk_index": 1},
        {"paper_id": "b", "chunk_index": 4},
        {"paper_id": "b", "chunk_index": 3},
    ]
    result = retriever._interleave_by_paper(chunks)
    assert [(c["paper_id"], c["chunk_index"]) for c in result] == [("a", 1), ("b", 3), ("a", 2), ("b", 4)]


def test_retriever_context_uses_canonical_citation_provenance():
    retriever = object.__new__(Retriever)
    retriever._compress_chunk_text = lambda content, query: content
    text = retriever._build_context(
        [
            {
                "paper_id": "p1",
                "paper_title": "Reliable Study",
                "page_number": 7,
                "content": "Supported finding.",
            }
        ]
    )
    assert "[Reliable Study, page 7]" in text
    parsed = _build_chunk_map(text)
    assert ("Reliable Study", 7) in parsed
    assert parsed[("Reliable Study", 7)]["text_snippet"] == "Supported finding."


def test_citation_page_outside_document_is_rejected_by_grounding():
    answer, citations = _process_citations(
        "Claim [Reliable Study, page 99].",
        [{"source": "Reliable Study", "page": 99, "text": "[Reliable Study, page 99]"}],
        {"reliable study": "paper-1"},
        {},
        {"paper-1": 12},
    )
    assert answer == "Claim [1]."
    assert citations[0]["page_valid"] is False
    assert citations[0]["verification_status"] == "unverified"
    assert citations[0]["grounding_score"] == 0.0


def test_provider_retry_stops_after_success(monkeypatch):
    generator = Generator()
    calls = []
    results = [
        SimpleNamespace(finish_reason="error"),
        SimpleNamespace(finish_reason="stop"),
    ]
    monkeypatch.setattr(settings, "provider_max_retries", 2)
    monkeypatch.setattr(settings, "provider_retry_backoff", 0)
    monkeypatch.setattr(
        generator,
        "_call_provider",
        lambda *args, **kwargs: calls.append(args[0]) or results.pop(0),
    )
    result = generator._call_provider_with_retry("example", "prompt")
    assert result.finish_reason == "stop"
    assert calls == ["example", "example"]


def test_chat_cache_key_isolated_by_generation_identity():
    local = _chat_cache_key("question", ["paper"], "current", None, generation_identity="local:qwen")
    cloud = _chat_cache_key("question", ["paper"], "current", None, generation_identity="cloud:gemini")

    assert local != cloud


def test_chat_cache_key_keeps_legacy_positional_arguments():
    positional = _chat_cache_key(
        "question",
        ["paper"],
        "current",
        None,
        "deep",
        True,
        "vi",
        "library:v1",
        "history:v1",
        generation_identity="cloud_custom:gemini:model",
    )
    keyword = _chat_cache_key(
        "question",
        ["paper"],
        "current",
        None,
        reasoning_mode="deep",
        strict_evidence=True,
        language="vi",
        data_version="library:v1",
        history_fp="history:v1",
        generation_identity="cloud_custom:gemini:model",
    )
    assert positional == keyword


def test_custom_cloud_routes_to_selected_provider():
    generator = Generator(mode="cloud_custom")
    generator.custom_cloud_provider = "claude"

    assert generator._get_provider_for_task("rag") == "claude"
