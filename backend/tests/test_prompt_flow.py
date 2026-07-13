"""Regression tests for prompt routing and prompt lifetime."""

from chat.generator_v2 import Generator
from chat.patched_generator import PatchedGenerator
from chat.prompt_factory import build_rag_user_prompt, build_system_prompt
from chat.types import GenerationResult


def test_compact_system_contract_and_rag_message():
    prompt = build_system_prompt("vi", "fast", strict_evidence=True)
    assert "ResearchMind" in prompt
    assert "insufficient" in prompt
    assert len(prompt) < 900

    message = build_rag_user_prompt("[Paper A] evidence", "What changed?")
    assert "## Context từ tài liệu:" in message
    assert "## Câu hỏi:" in message
    assert "[Paper A]" in message


def test_explicit_task_provider_and_fallback_override_reasoning_defaults():
    generator = Generator(task_provider_map='{"chat": "gemini"}')
    generator._local.reasoning_mode = "fast"
    generator.task_fallback_map = {"chat": "groq"}

    assert generator._get_provider_for_task("chat") == "gemini"
    assert generator._get_fallback_for_task("chat") == "groq"


def test_direct_generation_uses_and_restores_task_system_prompt(monkeypatch):
    generator = Generator()
    generator._local.system_prompt_override = "previous"

    def fake_generate(*_args, **_kwargs):
        return GenerationResult(
            content=generator._get_system_prompt(), citations=[], model_used="test"
        )

    monkeypatch.setattr(generator, "_generate_uncached", fake_generate)
    assert generator.generate_direct("task", system_prompt="entity-only") == "entity-only"
    assert generator._local.system_prompt_override == "previous"


def test_stream_verify_uses_and_restores_verify_prompt(monkeypatch):
    generator = Generator()
    generator._local.system_prompt_override = "previous"
    monkeypatch.setattr(generator, "_get_verify_system_prompt", lambda: "verify-only")
    monkeypatch.setattr(generator, "_stream_chain", lambda *_args: iter([generator._get_system_prompt()]))

    assert list(generator.stream_generate_verify("q", "x" * 60)) == ["verify-only"]
    assert generator._local.system_prompt_override == "previous"


def test_patched_stream_respects_provider_budget(monkeypatch):
    generator = PatchedGenerator()
    calls = []
    monkeypatch.setattr(generator, "_fit_prompt", lambda prompt, provider, limit: calls.append((provider, limit)) or prompt)

    assert list(generator._stream_provider("github", "prompt", 321)) == []
    assert calls == [("github", 321)]
