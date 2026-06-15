"""BM25 full-text search using SQLite FTS5."""

import json
from typing import Optional
from dataclasses import dataclass
from sqlalchemy import text
from sqlalchemy.orm import Session
from loguru import logger


@dataclass
class BM25Result:
    chunk_id: int
    paper_id: str
    chunk_index: int
    content: str
    page_number: Optional[int]
    paper_title: str
    score: float


class BM25Search:
    """BM25 search engine backed by SQLite FTS5."""

    def __init__(self, db_session: Session):
        self.db = db_session

    def ensure_fts_table(self):
        """Create FTS5 virtual table if it doesn't exist, and populate it."""
        # Create the FTS5 table
        self.db.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                content,
                content='chunks',
                content_rowid='id',
                tokenize='unicode61'
            )
        """))
        self.db.commit()

        # Check if FTS table is empty and needs population
        row = self.db.execute(text("SELECT COUNT(*) FROM chunks_fts")).scalar()
        if row == 0:
            self._rebuild_fts()

    def _rebuild_fts(self):
        """Rebuild FTS index from chunks table."""
        logger.info("Rebuilding FTS5 index...")
        self.db.execute(text("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')"))
        self.db.commit()
        count = self.db.execute(text("SELECT COUNT(*) FROM chunks_fts")).scalar()
        logger.info(f"FTS5 index rebuilt: {count} chunks indexed")

    def search(
        self,
        query: str,
        paper_ids: Optional[list[str]] = None,
        top_k: int = 20,
    ) -> list[BM25Result]:
        """
        Execute BM25 search using SQLite FTS5.

        Args:
            query: Search query text.
            paper_ids: Optional filter to specific papers.
            top_k: Number of results to return.

        Returns:
            List of BM25Result sorted by BM25 score (descending).
        """
        # Sanitize query for FTS5 (escape special characters)
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
        params = {"query": fts_query}

        if paper_ids:
            placeholders = ", ".join(f":pid_{i}" for i in range(len(paper_ids)))
            sql += f" AND c.paper_id IN ({placeholders})"
            for i, pid in enumerate(paper_ids):
                params[f"pid_{i}"] = pid

        sql += " ORDER BY rank LIMIT :limit"
        params["limit"] = top_k

        try:
            rows = self.db.execute(text(sql), params).fetchall()
        except Exception as e:
            logger.warning(f"FTS5 search failed: {e}")
            return []

        results = []
        for row in rows:
            results.append(BM25Result(
                chunk_id=row[0],
                paper_id=row[1],
                chunk_index=row[2],
                content=row[3],
                page_number=row[4],
                paper_title=row[5],
                score=float(row[6]) if row[6] is not None else 0.0,
            ))

        return results


def _sanitize_fts_query(query: str) -> str:
    """Convert a natural language query to FTS5 query syntax."""
    # Remove special characters, keep alphanumeric and unicode
    import re
    # Split into words, filter out empty/stop words
    words = query.split()
    # Escape special FTS5 characters
    sanitized = []
    for w in words:
        w = re.sub(r'[^\w\sàáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]', '', w)
        if w and len(w) > 1:
            sanitized.append(w)

    if not sanitized:
        return ""

    # Use NEAR operator for phrase matching, OR for individual terms
    return " OR ".join(sanitized)
