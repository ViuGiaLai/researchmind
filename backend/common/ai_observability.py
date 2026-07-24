"""Lightweight, local-first tracing and aggregate AI metrics."""
import json
import random
import time
import uuid
from collections import Counter
from contextlib import contextmanager
from contextvars import ContextVar

from loguru import logger

_trace_id: ContextVar[str] = ContextVar("ai_trace_id", default="")
_metrics = Counter()
def current_trace_id() -> str:
    return _trace_id.get()
@contextmanager
def trace(operation: str, **fields):
    trace_id = current_trace_id() or uuid.uuid4().hex[:16]
    token = _trace_id.set(trace_id)
    started = time.monotonic()
    _metrics[f"{operation}.calls"] += 1
    status = "success"
    try:
        yield trace_id
        _metrics[f"{operation}.success"] += 1
    except Exception:
        status = "error"
        _metrics[f"{operation}.error"] += 1
        raise
    finally:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        _metrics[f"{operation}.elapsed_ms"] += elapsed_ms
        details = " ".join(f"{k}={v}" for k, v in fields.items())
        logger.info(f"AI_TRACE trace_id={trace_id} operation={operation} elapsed_ms={elapsed_ms} {details}".rstrip())
        persist_trace(trace_id, operation, elapsed_ms, status, fields)
        _trace_id.reset(token)
def increment(metric: str, value: int = 1) -> None: _metrics[metric] += value
def snapshot() -> dict[str, int]: return dict(_metrics)


def persist_trace(trace_id: str, operation: str, elapsed_ms: int, status: str, fields: dict) -> None:
    """Best-effort sampled persistence; tracing must never break a request."""
    try:
        from app_state import state
        from config.settings import settings
        if state.engine is None or random.random() > float(getattr(settings, "ai_trace_sampling_rate", 0.1)):
            return
        from db.database import get_session
        from db.models import AITrace
        session = get_session(state.engine)
        try:
            session.add(AITrace(trace_id=trace_id, operation=operation, elapsed_ms=elapsed_ms, status=status, metadata_json=json.dumps(fields, default=str)))
            session.commit()
        finally:
            session.close()
    except Exception as exc:
        logger.debug(f"AI_TRACE persistence skipped: {exc}")
