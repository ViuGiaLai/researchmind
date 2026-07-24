import httpx

from chat.generator_v2 import Generator
from common.request_context import reset_request_bearer_token, set_request_bearer_token


def test_hosted_gateway_preserves_task_and_forwards_user_token():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers.get("authorization")
        seen["payload"] = __import__("json").loads(request.content)
        return httpx.Response(
            200,
            json={
                "content": "Supported result [Paper A, page 2].",
                "provider": "gemini",
                "model": "flash",
                "finish_reason": "stop",
                "primary_provider": "gemini",
                "selected_provider": "gemini",
                "fallback_used": False,
                "fallback_reason": "",
                "routing_key": "review",
            },
        )

    generator = Generator(
        researchmind_cloud_url="https://gateway.example",
        mode="cloud_free",
        task_provider_map='{"review":"github"}',
    )
    generator._http_client = httpx.Client(transport=httpx.MockTransport(handler))
    marker = set_request_bearer_token("firebase-user-token")
    try:
        result = generator._route_by_task("review", "evidence", 300)
    finally:
        reset_request_bearer_token(marker)
        generator._http_client.close()

    assert result is not None and result.finish_reason == "stop"
    assert seen["authorization"] == "Bearer firebase-user-token"
    assert seen["payload"]["task_type"] == "review"
    assert seen["payload"]["reasoning_mode"] == "fast"
    assert result.router_reason == "review: gemini (primary)"
    assert "provider" not in seen["payload"]


def test_hosted_gateway_stream_uses_existing_task_pipeline():
    generator = Generator(researchmind_cloud_url="https://gateway.example", mode="cloud_free")
    generator._stream_cloud_gateway = lambda *_args: iter(["hello"])
    assert list(generator._route_by_task_stream("chat", "question", 100)) == ["hello"]


def test_settings_can_initialize_without_env_file(monkeypatch):
    from config.settings import Settings

    monkeypatch.delenv("RESEARCHMIND_CLOUD_URL", raising=False)
    clean = Settings(_env_file=None)
    assert clean.host == "127.0.0.1"
    assert clean.gemini_api_key == ""


def test_stream_generate_forwards_rag_task_and_reasoning_mode():
    generator = Generator(researchmind_cloud_url="https://gateway.example", mode="cloud_free")
    captured = {}

    def fake_stream_chain(_prompt, _max_tokens, task_type):
        captured["task_type_argument"] = task_type
        captured["payload"] = generator._gateway_payload("prompt", 100)
        yield "hello"

    generator._stream_chain = fake_stream_chain
    result = list(
        generator.stream_generate(
            "question",
            "Document context long enough to use the evidence-aware RAG path.",
            reasoning_mode="fast",
            task_type="rag",
        )
    )

    assert result == ["hello"]
    assert captured["task_type_argument"] == "rag"
    assert captured["payload"]["task_type"] == "rag"
    assert captured["payload"]["reasoning_mode"] == "fast"
