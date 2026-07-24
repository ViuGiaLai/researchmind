"""
SQLite-based cache cho external API calls.
TTL: 24h cho OpenAlex, 7 ngày cho Crossref (metadata ít thay đổi).
Không dùng Redis để giữ local-first.
"""

import json
import sqlite3
import time
from pathlib import Path

from config.settings import settings

CACHE_DB_PATH: Path | None = None

TTL_OPENALEX = 24 * 3600
TTL_CROSSREF = 7 * 24 * 3600
TTL_CITING = 12 * 3600


def _get_path() -> Path:
    global CACHE_DB_PATH
    if CACHE_DB_PATH is None:
        CACHE_DB_PATH = settings.data_dir / "academic_cache.db"
    return CACHE_DB_PATH


def _get_conn() -> sqlite3.Connection:
    path = _get_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS academic_cache (
            cache_key   TEXT PRIMARY KEY,
            source      TEXT NOT NULL,
            data        TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_source ON academic_cache(source)")
    conn.commit()
    return conn


def cache_get(key: str, ttl: int) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT data, created_at FROM academic_cache WHERE cache_key = ?", (key,)).fetchone()
    conn.close()

    if not row:
        return None
    data_str, created_at = row
    if time.time() - created_at > ttl:
        return None
    return json.loads(data_str)


def cache_set(key: str, source: str, data: dict) -> None:
    conn = _get_conn()
    conn.execute(
        """INSERT OR REPLACE INTO academic_cache
           (cache_key, source, data, created_at) VALUES (?, ?, ?, ?)""",
        (key, source, json.dumps(data, ensure_ascii=False), int(time.time())),
    )
    conn.commit()
    conn.close()


def cache_invalidate_doi(doi: str) -> None:
    conn = _get_conn()
    conn.execute("DELETE FROM academic_cache WHERE cache_key LIKE ?", (f"%{doi}%",))
    conn.commit()
    conn.close()
