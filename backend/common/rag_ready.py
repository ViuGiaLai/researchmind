"""Shared guards for RAG pipeline readiness."""
from app_state import state
from common.i18n import t


def rag_unavailable_message(lang: str = "vi") -> str | None:
    """Return a user-facing error message when RAG is not ready, else None."""
    if not state.backend_ready:
        return t("error.backend_starting", lang)
    if not state.retriever:
        return t("error.search_not_ready", lang)
    if not state.generator:
        return t("error.ai_not_ready", lang)
    return None
