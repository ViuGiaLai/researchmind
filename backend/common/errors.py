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


@dataclass
class ClassifiedError:
    type: str
    message: str
    original: Exception | None = None


# Each rule: (keywords, type_label, user_message_template)
ERROR_RULES: list[tuple[list[str], str, str]] = [
    # Authentication
    (["authentication", "unauthorized", "401", "api key", "invalid key", "auth"], "authentication",
     "⚠️ Lỗi xác thực: {msg}. Vui lòng kiểm tra API key trong Settings."),
    (["403", "forbidden", "permission"], "authentication",
     "⚠️ Không có quyền truy cập: {msg}. Vui lòng kiểm tra API key."),

    # Rate limiting
    (["rate limit", "rate_limit", "429", "too many requests"], "rate_limit",
     "⚠️ Đã vượt quá giới hạn yêu cầu: {msg}. Vui lòng đợi và thử lại sau."),
    (["quota", "insufficient_quota", "exceeded"], "rate_limit",
     "⚠️ Đã hết hạn mức sử dụng: {msg}. Vui lòng kiểm tra tài khoản."),

    # Timeout
    (["timeout", "timed out", "timed_out"], "timeout",
     "⚠️ Yêu cầu đã hết thời gian chờ: {msg}. Vui lòng thử lại."),

    # Network / Connection
    (["connection", "connect", "refused", "resolve", "dns", "econnrefused"], "network",
     "⚠️ Không thể kết nối đến máy chủ: {msg}. Vui lòng kiểm tra kết nối mạng."),
    (["eof", "remote", "disconnect", "reset"], "network",
     "⚠️ Kết nối bị gián đoạn: {msg}. Vui lòng thử lại."),

    # Context too long
    (["context length", "context_length", "max_length", "too long", "maximum context",
      "token limit", "input too long", "too many tokens"], "context_length",
     "⚠️ Văn bản quá dài: {msg}. Vui lòng rút ngắn câu hỏi hoặc chọn ít tài liệu hơn."),

    # Model not found
    (["model not found", "not found", "404", "model_not_found", "does not exist",
      "not supported"], "model_not_found",
     "⚠️ Không tìm thấy mô hình: {msg}. Vui lòng kiểm tra tên model trong Settings."),

    # Server error
    (["500", "502", "503", "504", "internal server error", "service unavailable",
      "bad gateway"], "server_error",
     "⚠️ Máy chủ gặp lỗi: {msg}. Vui lòng thử lại sau."),

    # Local model specific
    (["llama-server", "llama_server", "llama.cpp", "llamacpp", "connection refused"],
     "local_model",
     "⚠️ Không thể kết nối đến llama-server. Vui lòng đảm bảo llama-server.exe đang chạy và đúng URL trong Settings."),
    (["cuda", "out of memory", "cuda out of memory", "cuda error"], "hardware",
     "⚠️ GPU không đủ bộ nhớ: {msg}. Vui lòng giảm context size hoặc thử lại."),

    # Free tier daily limit
    (["free", "daily limit", "quota exceeded"], "free_limit",
     "⚠️ Đã hết lượt sử dụng miễn phí hôm nay. Vui lòng quay lại vào ngày mai hoặc cấu hình API key riêng."),
]


def classify_error(exc: Exception, context: str = "") -> ClassifiedError:
    """
    Classify an exception into a user-friendly error.

    Args:
        exc: The original exception.
        context: Optional context string (e.g. provider name).

    Returns:
        ClassifiedError with type and user-friendly Vietnamese message.
    """
    msg = str(exc).lower()
    combined = f"{context} {msg}".lower()

    for keywords, err_type, template in ERROR_RULES:
        if any(kw in combined for kw in keywords):
            return ClassifiedError(
                type=err_type,
                message=template.format(msg=str(exc)[:200]),
                original=exc,
            )

    # Default fallback
    return ClassifiedError(
        type="unknown",
        message=f"⚠️ Lỗi không xác định: {exc}",
        original=exc,
    )


def is_retryable(err_type: str) -> bool:
    """Whether an error type is safe to retry."""
    return err_type in ("timeout", "network", "server_error", "rate_limit")


def is_auth_error(err_type: str) -> bool:
    """Whether an error type indicates authentication failure."""
    return err_type == "authentication"
