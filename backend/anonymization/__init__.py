"""Anonymization Engine — ResearchMind

Ẩn danh hóa thông tin nhạy cảm trong bài báo nghiên cứu chưa công bố:
- Tên tác giả  → [AUTHOR_N]
- Tên tổ chức  → [INSTITUTION_N]
- Email        → [EMAIL_N]
- Số grant     → [GRANT_N]

Thiết kế: Reversible (có mapping table) và Local-only (lưu SQLite).
"""

from .engine import AnonymizationEngine, AnonymizationResult

__all__ = ["AnonymizationEngine", "AnonymizationResult"]
