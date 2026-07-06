"""Shared guards for RAG pipeline readiness."""
from app_state import state


def rag_unavailable_message() -> str | None:
    """Return a user-facing error message when RAG is not ready, else None."""
    if not state.backend_ready:
        return "⏳ Backend đang khởi động. Vui lòng đợi vài giây rồi thử lại."
    if not state.retriever:
        return "⚠️ Bộ tìm kiếm chưa sẵn sàng. Hãy import ít nhất một paper trước."
    if not state.generator:
        return "⚠️ AI engine chưa sẵn sàng. Kiểm tra cài đặt LLM trong Settings."
    return None
