import asyncio
import json
import threading

import httpx

from chat.generator_v2 import Generator
from routers import chat as chat_router


class _Request:
    async def is_disconnected(self) -> bool:
        return False


class _Db:
    def add(self, _item) -> None:
        pass

    def commit(self) -> None:
        pass

    def rollback(self) -> None:
        pass

    def close(self) -> None:
        pass


class _Generator:
    def __init__(self, plans):
        self.plans = plans
        self.calls = []
        self._local = threading.local()

    def stream_generate(self, query, _context, **kwargs):
        call_index = len(self.calls)
        self.calls.append({"query": query, **kwargs})
        chunks, finish_reason = self.plans[call_index]
        self._local.metadata = {
            "model_used": f"fake/model-{call_index}",
            "router_reason": "test",
            "token_count": 10,
            "gateway_error": "",
            "finish_reason": finish_reason,
        }
        yield from chunks

    def get_stream_metadata(self):
        return self._local.metadata


async def _collect_stream(monkeypatch, generator):
    cached = []
    monkeypatch.setattr(chat_router.state, "generator", generator)
    monkeypatch.setattr(chat_router, "get_session", lambda _engine: _Db())
    monkeypatch.setattr(chat_router, "_put_chat_cache", lambda key, value: cached.append((key, value)))

    events = []
    async for frame in chat_router._stream_chat(
        _Request(),
        "Create the complete table",
        "Academic context " * 10,
        "session",
        [],
        cache_key="cache-key",
        reasoning_mode="fast",
        task_type="rag",
        paper_title_map={},
        chunk_map={},
        paper_page_map={},
    ):
        events.append(json.loads(frame.removeprefix("data: ").strip()))
    return events, cached


def test_stream_auto_continues_and_caches_only_complete_answer(monkeypatch):
    generator = _Generator(
        [
            (["First half"], "length"),
            ([" and second half."], "stop"),
        ]
    )

    events, cached = asyncio.run(_collect_stream(monkeypatch, generator))

    assert [event["chunk"] for event in events if "chunk" in event] == [
        "First half",
        " and second half.",
    ]
    assert generator.calls[0]["reasoning_mode"] == "fast"
    assert generator.calls[1]["reasoning_mode"] == "continue"
    assert generator.calls[1]["history"][-1] == {
        "role": "assistant",
        "content": "First half",
    }
    assert events[-1]["done"] is True
    assert events[-1]["truncated"] is False
    assert events[-1]["modified_content"] == "First half and second half."
    assert cached[0][1]["answer"] == "First half and second half."


def test_stream_does_not_cache_answer_still_truncated_after_all_continuations(monkeypatch):
    generator = _Generator(
        [
            (["First half"], "length"),
            ([" still incomplete"], "length"),
            ([" and remains incomplete"], "length"),
        ]
    )

    events, cached = asyncio.run(_collect_stream(monkeypatch, generator))

    assert events[-1]["done"] is True
    assert events[-1]["truncated"] is True
    assert cached == []


def test_stream_completes_on_second_continuation(monkeypatch):
    generator = _Generator(
        [
            (["First"], "length"),
            ([" second"], "length"),
            ([" third."], "stop"),
        ]
    )

    events, cached = asyncio.run(_collect_stream(monkeypatch, generator))

    assert len(generator.calls) == 3
    assert events[-1]["truncated"] is False
    assert events[-1]["modified_content"] == "First second third."
    assert cached[0][1]["answer"] == "First second third."


def test_openai_and_gemini_streams_preserve_length_finish_reason():
    generator = Generator()

    def openai_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text=(
                'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n'
                'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n'
                "data: [DONE]\n"
            ),
        )

    generator._http_client = httpx.Client(transport=httpx.MockTransport(openai_handler))
    generator._set_request_routing_context("rag", "fast")
    assert list(generator._stream_openai("prompt", "key", "model", "https://provider.test", 100)) == ["partial"]
    assert generator.get_stream_metadata()["finish_reason"] == "length"
    generator._http_client.close()

    def gemini_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text=(
                'data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}\n'
                'data: {"candidates":[{"finishReason":"MAX_TOKENS"}]}\n'
            ),
        )

    generator._http_client = httpx.Client(transport=httpx.MockTransport(gemini_handler))
    generator._set_request_routing_context("rag", "fast")
    assert list(generator._stream_gemini("prompt", "key", 100)) == ["partial"]
    assert generator.get_stream_metadata()["finish_reason"] == "length"
    generator._http_client.close()


def test_chat_and_rag_have_complete_cloud_output_budget():
    assert Generator.MODE_MAX_TOKENS["chat"] == 2048
    assert Generator.MODE_MAX_TOKENS["rag"] == 2048


def test_local_auto_continue_keeps_original_assistant_prefill():
    class Response:
        def __init__(self, lines):
            self.lines = lines

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def raise_for_status(self):
            pass

        def iter_lines(self):
            return iter(self.lines)

        def iter_bytes(self):
            return iter(f"{line}\n".encode() for line in self.lines)

    class Client:
        def __init__(self):
            self.prompts = []

        def stream(self, _method, _url, *, json, **_kwargs):
            self.prompts.append(json["prompt"])
            if len(self.prompts) == 1:
                return Response(['data: {"content":"A","stop":true,"truncated":true}'])
            return Response(['data: {"content":"B","stop":true,"truncated":false}'])

    generator = Generator(mode="local")
    client = Client()
    generator._http_client = client
    generator._set_request_routing_context("chat", "continue")
    generator._local.chat_history = [
        {"role": "user", "content": "question"},
        {"role": "assistant", "content": "Original"},
    ]

    assert list(generator._stream_local("continue", max_tokens=768)) == ["A", "B"]
    assert "OriginalA" in client.prompts[1]
