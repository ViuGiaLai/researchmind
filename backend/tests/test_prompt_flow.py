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
    assert "## Document context:" in message
    assert "## User question:" in message
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
    result = generator.generate_direct("task", system_prompt="entity-only")
    assert result.startswith("entity-only")
    assert "OUTPUT LANGUAGE" in result
    assert generator._local.system_prompt_override == "previous"


def test_stream_verify_uses_and_restores_verify_prompt(monkeypatch):
    generator = Generator()
    generator._local.system_prompt_override = "previous"
    monkeypatch.setattr(generator, "_get_verify_system_prompt", lambda: "verify-only")
    monkeypatch.setattr(generator, "_stream_chain", lambda *_args: iter([generator._get_system_prompt()]))

    result = list(generator.stream_generate_verify("q", "x" * 60))
    assert result[0].startswith("verify-only")
    assert "OUTPUT LANGUAGE" in result[0]
    assert generator._local.system_prompt_override == "previous"


def test_patched_stream_respects_provider_budget(monkeypatch):
    generator = PatchedGenerator()
    calls = []
    monkeypatch.setattr(generator, "_fit_prompt", lambda prompt, provider, limit: calls.append((provider, limit)) or prompt)

    assert list(generator._stream_provider("github", "prompt", 321)) == []
    assert calls == [("github", 321)]
