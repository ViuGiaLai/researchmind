"""End-to-end tests for deployed gateway (requires network)."""

import json
import httpx
import pytest

BASE = "https://researchmind-gateway.onrender.com"
HEADERS = {
    "Authorization": "Bearer my-secret-token-123",
    "Content-Type": "application/json",
}


@pytest.mark.network
def test_health():
    r = httpx.get(f"{BASE}/v1/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert len(data["providers"]) > 0


@pytest.mark.network
def test_generate():
    r = httpx.post(
        f"{BASE}/v1/generate",
        headers=HEADERS,
        json={
            "task_type": "chat",
            "system_prompt": "You are helpful",
            "user_prompt": "Say hello in 3 words",
            "max_tokens": 64,
            "temperature": 0.3,
        },
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["content"]
    assert data["provider"]
    assert data["model"]


@pytest.mark.network
def test_generate_stream():
    r = httpx.post(
        f"{BASE}/v1/generate/stream",
        headers=HEADERS,
        json={
            "task_type": "chat",
            "system_prompt": "You are helpful",
            "user_prompt": "Count 1 to 3",
            "max_tokens": 64,
            "temperature": 0.3,
        },
        timeout=30,
    )
    assert r.status_code == 200
    lines = [json.loads(l) for l in r.iter_lines() if l]
    assert lines[-1]["type"] == "done"
    assert any(l["type"] == "delta" for l in lines)


@pytest.mark.network
def test_embeddings():
    r = httpx.post(
        f"{BASE}/v1/embeddings",
        headers=HEADERS,
        json={"texts": ["hello world"], "model": "gemini-embedding-001"},
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["embeddings"]) == 1


@pytest.mark.network
def test_translate():
    r = httpx.post(
        f"{BASE}/v1/translate",
        headers=HEADERS,
        json={
            "texts": ["Hello world"],
            "source_language": "en",
            "target_language": "vi",
            "max_tokens": 256,
            "temperature": 0.1,
        },
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["translations"]) == 1


@pytest.mark.network
def test_quota():
    r = httpx.get(f"{BASE}/v1/quota", headers=HEADERS, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "requests_used" in data
    assert "requests_limit" in data
