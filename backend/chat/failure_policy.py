"""Classify provider failures for retry and fallback decisions."""
import httpx


def classify_failure(error: Exception) -> dict:
    if isinstance(error, (TimeoutError, httpx.TimeoutException)):
        return {"kind":"timeout", "retryable":True}
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        if status == 429:
            return {"kind":"rate_limit", "retryable":True}
        if status >= 500:
            return {"kind":"server", "retryable":True}
        if status in (401, 403):
            return {"kind":"authentication", "retryable":False}
        return {"kind":"client", "retryable":False}
    return {"kind":"unknown", "retryable":False}
