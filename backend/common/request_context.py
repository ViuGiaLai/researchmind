"""Request-scoped values that safely flow into sync worker threads."""

from contextvars import ContextVar

_bearer_token: ContextVar[str] = ContextVar("researchmind_bearer_token", default="")


def set_request_bearer_token(token: str):
    return _bearer_token.set(token)


def reset_request_bearer_token(marker) -> None:
    _bearer_token.reset(marker)


def get_request_bearer_token() -> str:
    return _bearer_token.get()

