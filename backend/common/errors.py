"""Error classification with user-friendly messages.

Adapted from open-notebook (MIT):
https://github.com/lfnovo/open-notebook/blob/main/open_notebook/utils/error_classifier.py

Usage:
    try:
        result = await model.generate(...)
    except Exception as e:
        classified = classify_error(e)
        return {"error": classified.message}
"""

from dataclasses import dataclass

from common.i18n import t as _t


@dataclass
class ClassifiedError:
    type: str
    message: str
    original: Exception | None = None


# Each rule: (keywords, type_label, i18n_key)
_ERROR_RULES: list[tuple[list[str], str, str]] = [
    (["authentication", "unauthorized", "401", "api key", "invalid key", "auth"], "authentication", "error.auth"),
    (["403", "forbidden", "permission"], "authentication", "error.forbidden"),
    (["rate limit", "rate_limit", "429", "too many requests"], "rate_limit", "error.rate_limit"),
    (["quota", "insufficient_quota", "exceeded"], "rate_limit", "error.quota_exhausted"),
    (["timeout", "timed out", "timed_out"], "timeout", "error.timeout"),
    (["connection", "connect", "refused", "resolve", "dns", "econnrefused"], "network", "error.connection_refused"),
    (["eof", "remote", "disconnect", "reset"], "network", "error.connection_interrupted"),
    (
        [
            "context length",
            "context_length",
            "max_length",
            "too long",
            "maximum context",
            "token limit",
            "input too long",
            "too many tokens",
        ],
        "context_length",
        "error.text_too_long",
    ),
    (
        ["model not found", "not found", "404", "model_not_found", "does not exist", "not supported"],
        "model_not_found",
        "error.model_not_found",
    ),
    (
        ["500", "502", "503", "504", "internal server error", "service unavailable", "bad gateway"],
        "server_error",
        "error.server_error",
    ),
    (
        ["llama-server", "llama_server", "llama.cpp", "llamacpp", "connection refused"],
        "local_model",
        "error.llama_not_found",
    ),
    (["cuda", "out of memory", "cuda out of memory", "cuda error"], "hardware", "error.gpu_oom"),
    (["free", "daily limit", "quota exceeded"], "free_limit", "error.free_quota"),
]


def classify_error(exc: Exception, context: str = "", lang: str = "vi") -> ClassifiedError:
    """
    Classify an exception into a user-friendly error.

    Args:
        exc: The original exception.
        context: Optional context string (e.g. provider name).
        lang: Language code for the error message.

    Returns:
        ClassifiedError with type and user-friendly message.
    """
    msg = str(exc).lower()
    combined = f"{context} {msg}".lower()

    for keywords, err_type, i18n_key in _ERROR_RULES:
        if any(kw in combined for kw in keywords):
            return ClassifiedError(
                type=err_type,
                message=_t(i18n_key, lang, msg=str(exc)[:200]),
                original=exc,
            )

    return ClassifiedError(
        type="unknown",
        message=_t("error.unknown", lang, error=str(exc)),
        original=exc,
    )


def is_retryable(err_type: str) -> bool:
    """Whether an error type is safe to retry."""
    return err_type in ("timeout", "network", "server_error", "rate_limit")


def is_auth_error(err_type: str) -> bool:
    """Whether an error type indicates authentication failure."""
    return err_type == "authentication"
