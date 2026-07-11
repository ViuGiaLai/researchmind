"""
Helper kiểm tra trạng thái paper trước khi gọi insight/verify endpoints.
Tránh trường hợp paper đang được index mà vẫn chạy retrieve → không có chunks → báo lỗi.
"""
from typing import Optional
from loguru import logger
from app_state import state
from db.database import get_session
from db.models import Paper
from common.i18n import t


def check_papers_ready(paper_ids: Optional[list[str]], lang: str = "vi") -> Optional[str]:
    """
    Kiểm tra tất cả paper đã được index chưa.
    Returns: error message (str) nếu có vấn đề, None nếu OK.
    """
    if not paper_ids:
        return None

    session = get_session(state.engine)
    try:
        papers = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        found_ids = {p.id for p in papers}
        missing = [pid for pid in paper_ids if pid not in found_ids]
        if missing:
            label = ", ".join(missing[:3])
            if len(missing) > 3:
                label += f" (+{len(missing) - 3} nữa)"
            return t("verify.paper_not_found", lang, label=label)
        for p in papers:
            if p.status in ("indexing", "summarizing"):
                logger.warning(f"Paper {p.id} ({p.filename}) still indexing")
                return t("verify.paper_indexing", lang, filename=p.filename)
            if p.status == "needs_ocr":
                logger.warning(f"Paper {p.id} ({p.filename}) needs OCR")
                return t("verify.paper_scanned", lang, filename=p.filename)
            if p.status == "failed":
                logger.warning(f"Paper {p.id} ({p.filename}) indexing failed")
                return t("verify.paper_index_failed", lang, filename=p.filename)
            if p.status == "pending":
                logger.warning(f"Paper {p.id} ({p.filename}) pending")
                return t("verify.paper_not_indexed", lang, filename=p.filename)
        return None
    finally:
        session.close()
