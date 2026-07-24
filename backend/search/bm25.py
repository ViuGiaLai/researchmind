"""BM25 full-text search using SQLite FTS5."""

import re
from dataclasses import dataclass

from loguru import logger
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker


@dataclass
class BM25Result:
    chunk_id: int
    paper_id: str
    chunk_index: int
    content: str
    page_number: int | None
    paper_title: str
    score: float


class BM25Search:
    """BM25 search engine backed by SQLite FTS5.

    A fresh SQLAlchemy session is created for every operation. The service is
    shared by FastAPI requests and background threads, while SQLAlchemy Session
    instances are explicitly not thread-safe.
    """

    def __init__(self, db_session: Session):
        bind = db_session.get_bind()
        self._session_factory = sessionmaker(bind=bind, expire_on_commit=False)
        # The constructor historically took ownership of this long-lived
        # session. It is no longer retained, so release its connection now.
        db_session.close()

    def ensure_fts_table(self):
        """Create the FTS5 virtual table if it does not exist and populate it."""
        with self._session_factory() as db:
            db.execute(
                text(
                    """
                    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                        content,
                        content='chunks',
                        content_rowid='id',
                        tokenize='unicode61'
                    )
                    """
                )
            )
            db.commit()

            # COUNT(*) on an external-content FTS table mirrors the content
            # table even when the search index itself is empty. The docsize
            # table tracks documents actually present in the FTS index.
            source_count = db.execute(text("SELECT COUNT(*) FROM chunks")).scalar() or 0
            try:
                indexed_count = db.execute(text("SELECT COUNT(*) FROM chunks_fts_docsize")).scalar() or 0
            except Exception:
                indexed_count = -1
            if indexed_count != source_count:
                self._rebuild_fts(db)

    def _rebuild_fts(self, db: Session | None = None):
        """Rebuild the FTS index using an isolated session when called directly."""
        owns_session = db is None
        if db is None:
            db = self._session_factory()
        try:
            logger.info("Rebuilding FTS5 index...")
            db.execute(text("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')"))
            db.commit()
            count = db.execute(text("SELECT COUNT(*) FROM chunks_fts_docsize")).scalar()
            logger.info(f"FTS5 index rebuilt: {count} chunks indexed")
        finally:
            if owns_session:
                db.close()

    def search(
        self,
        query: str,
        paper_ids: list[str] | None = None,
        top_k: int = 20,
    ) -> list[BM25Result]:
        """Execute BM25 search and return results sorted by SQLite rank."""
        fts_query = _sanitize_fts_query(query)
        if not fts_query:
            return []

        sql = """
            SELECT
                c.id,
                c.paper_id,
                c.chunk_index,
                c.content,
                c.page_number,
                COALESCE(p.title, p.filename) as paper_title,
                rank
            FROM chunks_fts f
            JOIN chunks c ON c.id = f.rowid
            JOIN papers p ON p.id = c.paper_id
            WHERE chunks_fts MATCH :query
            AND p.status = 'indexed'
        """
        params: dict[str, object] = {"query": fts_query}

        if paper_ids:
            placeholders = ", ".join(f":pid_{i}" for i in range(len(paper_ids)))
            sql += f" AND c.paper_id IN ({placeholders})"
            for i, paper_id in enumerate(paper_ids):
                params[f"pid_{i}"] = paper_id

        sql += " ORDER BY rank LIMIT :limit"
        params["limit"] = max(1, min(int(top_k), 1000))

        try:
            with self._session_factory() as db:
                rows = db.execute(text(sql), params).fetchall()
        except Exception as exc:
            logger.warning(f"FTS5 search failed: {exc}")
            return []

        return [
            BM25Result(
                chunk_id=row[0],
                paper_id=row[1],
                chunk_index=row[2],
                content=row[3],
                page_number=row[4],
                paper_title=row[5],
                score=float(row[6]) if row[6] is not None else 0.0,
            )
            for row in rows
        ]


def _sanitize_fts_query(query: str) -> str:
    """Convert a natural-language query to safe FTS5 terms."""
    sanitized = []
    for word in query.split():
        word = re.sub(
            r"[^\w\sàáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]",
            "",
            word,
        )
        if word and len(word) > 1:
            sanitized.append(word)
    return " OR ".join(sanitized)
