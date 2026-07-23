import asyncio

import pytest

from cloud_gateway.auth import validate_auth_configuration
from cloud_gateway.config import GatewaySettings
from cloud_gateway.providers import ProviderRouter
from cloud_gateway.quota import QuotaManager


def test_production_refuses_open_unauthenticated_mode(monkeypatch):
    from cloud_gateway import auth

    settings = GatewaySettings(environment="production", allow_unauthenticated=True, firebase_project_id="project")
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    with pytest.raises(RuntimeError, match="ALLOW_UNAUTHENTICATED"):
        validate_auth_configuration()


def test_router_never_exposes_or_requires_provider_key_from_client():
    settings = GatewaySettings(_env_file=None, gemini_api_key="server-secret", task_provider_map='{"review":"gemini"}')
    router = ProviderRouter(settings)
    assert router.candidates("review")[0] == "gemini"
    assert "server-secret" not in str(router.task_map)


def test_router_supports_all_openai_providers():
    """Verify every OpenAI-compatible provider name is recognized via _openai_request."""
    settings = GatewaySettings(_env_file=None, cloudflare_url="https://cf.test")
    router = ProviderRouter(settings)
    providers = ["groq", "openrouter", "openrouter_r1", "cerebras",
                 "deepseek", "github", "github_deepseek_v3",
                 "nvidia", "nvidia_deepseek", "freemodel", "cohere"]
    for provider in providers:
        try:
            # _openai_request should raise ProviderError only if provider not in bases dict
            # Pass a request that will fail later (missing attributes), but that's OK
            # as long as it doesn't raise ProviderError
            from cloud_gateway.providers import ProviderError
            from cloud_gateway.schemas import GenerateRequest
            req = GenerateRequest(user_prompt="test", system_prompt="test")
            url, headers, payload = router._openai_request(provider, req, False)
            assert url.endswith("/chat/completions")
            assert "Authorization" in headers
        except ProviderError:
            pytest.fail(f"Provider {provider} raised ProviderError (not in bases dict)")


def test_router_available_checks_key_for_each_provider():
    """Setting a key makes the provider available."""
    settings = GatewaySettings(_env_file=None,
                                gemini_api_key="gk", groq_api_key="gk",
                                openrouter_api_key="gk", cerebras_api_key="gk",
                                cloudflare_api_key="gk", cloudflare_url="https://cf.test",
                                claude_api_key="gk",
                                deepseek_api_key="gk",
                                github_api_key="gk", github_deepseek_v3_api_key="gk",
                                nvidia_api_key="gk", nvidia_deepseek_api_key="gk",
                                freemodel_api_key="gk", cohere_api_key="gk",
                                openrouter_r1_api_key="gk")
    router = ProviderRouter(settings)
    # Expected non-OpenAI providers
    assert router.available("gemini")
    assert router.available("claude")
    # All OpenAI providers
    for p in ["groq", "openrouter", "cerebras", "deepseek", "github",
              "nvidia", "nvidia_deepseek", "freemodel", "cohere", "cloudflare",
              "openrouter_r1", "github_deepseek_v3"]:
        assert router.available(p), f"{p} should be available"


def test_development_quota_is_enforced(monkeypatch):
    import cloud_gateway.quota as quota_module

    settings = GatewaySettings(_env_file=None, free_requests_per_day=1, free_input_chars_per_day=100)
    monkeypatch.setattr(quota_module, "get_settings", lambda: settings)
    manager = QuotaManager()
    user = {"uid": "test", "auth": "shared"}
    manager.reserve(user, 10)
    with pytest.raises(Exception) as exc:
        manager.reserve(user, 10)
    assert getattr(exc.value, "status_code", None) == 429



def test_mode_aware_routing_policy_selects_specialized_models():
    settings = GatewaySettings(
        _env_file=None,
        gemini_api_key="key",
        groq_api_key="key",
        deepseek_api_key="key",
        openrouter_r1_api_key="key",
    )
    router = ProviderRouter(settings)

    assert router.candidates("chat", "fast")[0] == "gemini"
    assert router.candidates("chat", "deep")[0] == "deepseek"
    assert router.candidates("chat", "deep+")[0] == "openrouter_r1"
    assert router.candidates("rag", "fast")[0] == "gemini"
    assert router.candidates("review_outline", "fast")[0] == "groq"


def test_missing_primary_is_reported_as_fallback_not_silent_default():
    from cloud_gateway.schemas import GenerateRequest

    settings = GatewaySettings(_env_file=None, groq_api_key="key")
    router = ProviderRouter(settings)
    request = GenerateRequest(
        user_prompt="test",
        task_type="rag",
        reasoning_mode="fast",
    )

    assert router.candidates("rag", "fast")[0] == "groq"
    metadata = router.routing_metadata(request, "groq", [])
    assert metadata == {
        "primary_provider": "gemini",
        "selected_provider": "groq",
        "fallback_used": True,
        "fallback_reason": "gemini is not configured or unavailable",
        "routing_key": "rag.fast",
    }

def test_all_academic_task_routes_have_an_explicit_policy():
    settings = GatewaySettings(
        _env_file=None,
        gemini_api_key="key",
        groq_api_key="key",
        deepseek_api_key="key",
        nvidia_deepseek_api_key="key",
        github_api_key="key",
        cerebras_api_key="key",
    )
    router = ProviderRouter(settings)
    expected_primary = {
        "review_outline": "groq",
        "review_section": "nvidia_deepseek",
        "review": "nvidia_deepseek",
        "verify": "gemini",
        "critique": "gemini",
        "debate": "nvidia_deepseek",
        "summary": "groq",
        "quality_check": "github",
        "translate": "gemini",
        "entity": "cerebras",
        "research": "deepseek",
        "synthesis": "deepseek",
        "gap": "deepseek",
        "insight": "github",
    }

    for task_type, primary in expected_primary.items():
        routing_key, planned = router.route(task_type, "fast")
        assert routing_key == task_type
        assert planned[0] == primary
        assert router.candidates(task_type, "fast")[0] == primary
