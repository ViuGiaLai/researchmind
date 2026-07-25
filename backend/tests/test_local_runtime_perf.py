"""Local GGUF runtime performance guards.

These tests lock in the CPU-friendly caps that keep local mode usable:
- tight output token ceilings
- compact system prompts
- reduced input budget for provider=local
- max_tokens always forwarded into _stream_local
"""

from chat.generator_v2 import Generator
from chat.patched_generator import PatchedGenerator
from chat.prompt_budget import PROVIDER_INPUT_BUDGET, get_provider_input_budget
from chat.providers.local_provider import (
    LOCAL_MODE_CAPS,
    LOCAL_TASK_CAPS,
    MAX_LOCAL_NTOKENS,
    MIN_LOCAL_NTOKENS,
)


def test_local_input_budget_is_cpu_friendly():
    assert PROVIDER_INPUT_BUDGET["local"] <= 2000
    assert get_provider_input_budget("local") <= 2000


def test_adaptive_top_k_caps_for_local_mode():
    from chat.retrieval_policy import adaptive_top_k

    # Cloud-style adaptive can grow to 7–10 chunks; local must stay tiny.
    assert adaptive_top_k("compare transformer versus rnn architecture carefully", 5, "review", llm_mode="local") <= 3
    assert adaptive_top_k("what is attention", 5, "chat", llm_mode="local") <= 3
    assert adaptive_top_k("what is attention", 5, "chat", llm_mode="cloud_free") >= 3


def test_cap_local_max_tokens_respects_mode_and_task():
    gen = Generator(mode="local", local_max_tokens=1024)
    gen._local.reasoning_mode = "fast"
    gen._local.task_type = "chat"

    assert gen._cap_local_max_tokens(4096, "chat", "fast") == LOCAL_MODE_CAPS["fast"]
    assert gen._cap_local_max_tokens(4096, "preview", "fast") == LOCAL_TASK_CAPS["preview"]
    assert gen._cap_local_max_tokens(32, "chat", "fast") == MIN_LOCAL_NTOKENS
    assert gen._cap_local_max_tokens(9000, "research", "deep_plus") <= MAX_LOCAL_NTOKENS


def test_resolve_ntokens_uses_task_and_mode_caps():
    gen = Generator(mode="local", local_max_tokens=1024)
    gen._local.reasoning_mode = "fast"
    gen._local.task_type = "summary"
    assert gen._resolve_ntokens(None) == LOCAL_TASK_CAPS["summary"]
    # chat has no fixed task cap — deep mode may use the mode ceiling
    gen._local.task_type = "chat"
    gen._local.reasoning_mode = "deep"
    assert gen._resolve_ntokens(2048) == LOCAL_MODE_CAPS["deep"]
    gen._local.reasoning_mode = "fast"
    assert gen._resolve_ntokens(2048) == LOCAL_MODE_CAPS["fast"]


def test_local_system_prompt_is_compact():
    gen = Generator(mode="local")
    gen._local.reasoning_mode = "fast"
    gen._local.language_instruction = "OUTPUT LANGUAGE: Vietnamese."
    gen._local.system_prompt_override = None
    sp = gen._get_local_system_prompt()
    assert "ResearchMind" in sp
    assert len(sp) < 500
    assert "<think>" not in sp or "No <think>" in sp


def test_local_external_prompt_does_not_demand_long_essays():
    gen = Generator(mode="local")
    gen._local.reasoning_mode = "deep_plus"
    gen._local.language_instruction = ""
    sp = gen._get_external_system_prompt()
    assert "1000" not in sp
    assert "500-1000" not in sp
    assert len(sp) < 280


def test_stream_local_receives_capped_max_tokens(monkeypatch):
    gen = Generator(mode="local", local_max_tokens=512)
    seen = {}

    def fake_stream(prompt, max_tokens=None):
        seen["prompt"] = prompt
        seen["max_tokens"] = max_tokens
        yield "ok"

    monkeypatch.setattr(gen, "_stream_local", fake_stream)
    monkeypatch.setattr(gen, "_fit_prompt", lambda prompt, provider, limit, *a, **k: f"FIT:{prompt}")

    out = list(gen._stream_chain("long user prompt", max_tokens=4096, task_type="chat"))
    assert out == ["ok"]
    assert seen["prompt"].startswith("FIT:")
    assert seen["max_tokens"] == LOCAL_MODE_CAPS["fast"]


def test_patched_stream_provider_local_forwards_max_tokens(monkeypatch):
    gen = PatchedGenerator(mode="local", local_max_tokens=512)
    seen = {}

    def fake_stream(prompt, max_tokens=None):
        seen["max_tokens"] = max_tokens
        seen["prompt"] = prompt
        if False:
            yield  # make it a generator
        return
        yield  # pragma: no cover

    monkeypatch.setattr(gen, "_stream_local", fake_stream)
    monkeypatch.setattr(gen, "_fit_prompt", lambda prompt, provider, limit, *a, **k: prompt)
    monkeypatch.setattr(gen, "_set_model", lambda *_a, **_k: None)

    list(gen._stream_provider("local", "hello", 2048))
    assert seen["max_tokens"] == LOCAL_MODE_CAPS["fast"]


def test_generate_caps_deep_mode_tokens_on_local(monkeypatch):
    gen = Generator(mode="local", local_max_tokens=1024)
    captured = {}

    def fake_uncached(query, context_text, citations_meta=None, max_tokens=None, task_type="", **kwargs):
        captured["max_tokens"] = max_tokens
        from chat.types import GenerationResult

        return GenerationResult(content="x", citations=[], model_used="local/test")

    monkeypatch.setattr(gen, "_generate_uncached", fake_uncached)
    gen.generate("q", "", reasoning_mode="deep", task_type="chat", use_cache=False)
    assert captured["max_tokens"] == LOCAL_MODE_CAPS["deep"]
    assert captured["max_tokens"] < 4096

    # Configured local_max_tokens is a hard ceiling even in deep mode
    gen2 = Generator(mode="local", local_max_tokens=256)
    captured2 = {}

    def fake_uncached2(query, context_text, citations_meta=None, max_tokens=None, task_type="", **kwargs):
        captured2["max_tokens"] = max_tokens
        from chat.types import GenerationResult

        return GenerationResult(content="x", citations=[], model_used="local/test")

    monkeypatch.setattr(gen2, "_generate_uncached", fake_uncached2)
    gen2.generate("q", "", reasoning_mode="deep", task_type="chat", use_cache=False)
    assert captured2["max_tokens"] == 256
