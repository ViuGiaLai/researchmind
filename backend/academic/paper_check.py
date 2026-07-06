"""
Helper kiểm tra trạng thái paper trước khi gọi insight/verify endpoints.
Tránh trường hợp paper đang được index mà vẫn chạy retrieve → không có chunks → báo lỗi.
"""
from typing import Optional
from loguru import logger
from app_state import state
from db.database import get_session
from db.models import Paper


def check_papers_ready(paper_ids: Optional[list[str]]) -> Optional[str]:
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
            suffix = f" (+{len(missing) - 3} nữa)" if len(missing) > 3 else ""
            return f"⚠️ Không tìm thấy paper: {label}{suffix}. Vui lòng chọn lại từ thư viện."
        for p in papers:
            if p.status in ("indexing", "summarizing"):
                logger.warning(f"Paper {p.id} ({p.filename}) still indexing")
                return f"⚠️ Paper **{p.filename}** đang được index. Vui lòng đợi vài giây rồi thử lại."
            if p.status == "needs_ocr":
                logger.warning(f"Paper {p.id} ({p.filename}) needs OCR")
                return f"⚠️ Paper **{p.filename}** có vẻ là PDF scan và cần OCR lại trước khi dùng AI."
            if p.status == "failed":
                logger.warning(f"Paper {p.id} ({p.filename}) indexing failed")
                return f"⚠️ Paper **{p.filename}** index thất bại. Vui lòng import lại."
            if p.status == "pending":
                logger.warning(f"Paper {p.id} ({p.filename}) pending")
                return f"⚠️ Paper **{p.filename}** chưa được index. Vui lòng import lại."
        return None
    finally:
        session.close()
