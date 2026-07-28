import asyncio
import json

from starlette.requests import Request

from cloud_gateway import main


def request_with_headers(headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request({"type": "http", "method": "GET", "path": "/v1/client-config", "headers": headers or []})


def test_client_config_exposes_only_public_configuration(monkeypatch):
    monkeypatch.setattr(main.settings, "frontend_clerk_publishable_key", "pk_test_public")
    monkeypatch.setattr(main.settings, "frontend_cloud_sync_url", "https://sync.example.com/api")
    monkeypatch.setattr(main.settings, "frontend_reports_api_url", "https://reports.example.com/api/v1")
    monkeypatch.setattr(main.settings, "frontend_client_config_version", 8)
    monkeypatch.setattr(main.settings, "frontend_config_generated_at", "2026-07-28T00:00:00Z")
    monkeypatch.setattr(main.settings, "frontend_feature_flags", '{"cloudSync":true,"reports":false}')

    response = asyncio.run(main.client_config(request_with_headers()))
    body = json.loads(response.body)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["etag"]
    assert body == {
        "schemaVersion": 1,
        "clientConfigVersion": 8,
        "generatedAt": "2026-07-28T00:00:00Z",
        "config": {
            "clerkPublishableKey": "pk_test_public",
            "cloudSyncUrl": "https://sync.example.com/api",
            "reportsApiUrl": "https://reports.example.com/api/v1",
            "featureFlags": {"cloudSync": True, "reports": False},
        },
    }
    assert "apiKey" not in json.dumps(body).lower()


def test_client_config_honors_matching_etag(monkeypatch):
    monkeypatch.setattr(main.settings, "frontend_feature_flags", "not-json")
    first = asyncio.run(main.client_config(request_with_headers()))
    etag = first.headers["etag"].encode()

    response = asyncio.run(main.client_config(request_with_headers([(b"if-none-match", etag)])))

    assert response.status_code == 304
    assert response.headers["etag"] == etag.decode()
    assert response.body == b""