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
    settings = GatewaySettings(_env_file=None, gemini_api_key="server-secret")
    router = ProviderRouter(settings)
    assert router.candidates("review")[0] == "gemini"
    assert "server-secret" not in str(router.task_map)


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

