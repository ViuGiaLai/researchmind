import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from chat.generator_v2 import Generator
from common.async_iter import AsyncThreadIterator


@pytest.mark.asyncio
async def test_blocking_iterator_does_not_block_event_loop():
    def source():
        time.sleep(0.05)
        yield "ready"

    stream = AsyncThreadIterator(source)
    consume = asyncio.create_task(anext(stream))

    started = time.perf_counter()
    await asyncio.sleep(0.01)
    elapsed = time.perf_counter() - started

    assert elapsed < 0.04
    assert await consume == "ready"


@pytest.mark.asyncio
async def test_iterator_keeps_one_dedicated_thread_and_captures_result():
    producer_threads: list[int] = []

    def source():
        for value in range(3):
            producer_threads.append(threading.get_ident())
            yield value

    stream = AsyncThreadIterator(
        source,
        on_complete=lambda: {"thread": threading.get_ident()},
    )
    assert [value async for value in stream] == [0, 1, 2]
    assert len(set(producer_threads)) == 1
    assert stream.result == {"thread": producer_threads[0]}
    assert producer_threads[0] != threading.get_ident()


@pytest.mark.asyncio
async def test_iterator_propagates_provider_errors():
    def source():
        yield "first"
        raise RuntimeError("provider disconnected")

    stream = AsyncThreadIterator(source)
    assert await anext(stream) == "first"
    with pytest.raises(RuntimeError, match="provider disconnected"):
        await anext(stream)


def test_generator_stream_metadata_is_isolated_per_thread():
    generator = Generator(mode="local")
    barrier = threading.Barrier(2)

    def set_and_read(model: str):
        generator._set_request_routing_context("chat", "fast")
        generator._set_model(model)
        barrier.wait()
        return generator.get_stream_metadata()

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(set_and_read, "provider/first")
        second = executor.submit(set_and_read, "provider/second")

    assert first.result()["model_used"] == "provider/first"
    assert second.result()["model_used"] == "provider/second"
