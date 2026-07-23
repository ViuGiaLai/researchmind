"""Async bridge for blocking iterators with bounded backpressure."""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable, Iterator
from concurrent.futures import CancelledError as FutureCancelledError
from concurrent.futures import TimeoutError as FutureTimeoutError
from typing import Any, Generic, TypeVar

T = TypeVar("T")
_DONE = object()


class AsyncThreadIterator(Generic[T]):
    """Consume a blocking iterator without blocking the asyncio event loop.

    A dedicated thread is used for the full iterator lifetime. This matters for
    provider generators that use ``threading.local`` request state and cannot
    safely migrate between generic thread-pool workers.
    """

    def __init__(
        self,
        source_factory: Callable[[], Iterator[T]],
        *,
        on_complete: Callable[[], Any] | None = None,
        max_buffer: int = 16,
    ) -> None:
        self._source_factory = source_factory
        self._on_complete = on_complete
        self._max_buffer = max(1, max_buffer)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue[object] | None = None
        self._cancelled = threading.Event()
        self._thread: threading.Thread | None = None
        self.result: Any = None

    def __aiter__(self) -> AsyncThreadIterator[T]:
        self._start()
        return self

    async def __anext__(self) -> T:
        self._start()
        assert self._queue is not None
        try:
            message = await self._queue.get()
        except asyncio.CancelledError:
            await self.aclose()
            raise
        if message is _DONE:
            raise StopAsyncIteration
        kind, payload = message
        if kind == "error":
            raise payload
        return payload

    async def aclose(self) -> None:
        self._cancelled.set()
        # Do not block cancellation on a provider socket. The producer owns and
        # closes the iterator as soon as its current blocking read returns.
        await asyncio.sleep(0)

    def _start(self) -> None:
        if self._thread is not None:
            return
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=self._max_buffer)
        self._thread = threading.Thread(
            target=self._produce,
            name="researchmind-stream",
            daemon=True,
        )
        self._thread.start()

    def _send(self, message: object) -> bool:
        if self._cancelled.is_set() or self._loop is None or self._queue is None:
            return False
        try:
            future = asyncio.run_coroutine_threadsafe(self._queue.put(message), self._loop)
            while not self._cancelled.is_set():
                try:
                    future.result(timeout=0.1)
                    return True
                except FutureTimeoutError:
                    continue
            future.cancel()
            return False
        except (RuntimeError, FutureCancelledError):
            return False

    def _produce(self) -> None:
        iterator: Iterator[T] | None = None
        try:
            iterator = iter(self._source_factory())
            for item in iterator:
                if self._cancelled.is_set() or not self._send(("value", item)):
                    break
        except Exception as exc:
            self._send(("error", exc))
        finally:
            if iterator is not None:
                close = getattr(iterator, "close", None)
                if close is not None:
                    try:
                        close()
                    except Exception:
                        pass
            if self._on_complete is not None:
                try:
                    self.result = self._on_complete()
                except Exception:
                    self.result = None
            self._send(_DONE)
