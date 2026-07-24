from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from search.bm25 import BM25Search


def test_bm25_uses_isolated_sessions_across_threads(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'bm25.db'}",
        connect_args={"check_same_thread": False},
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE papers (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    filename TEXT,
                    status TEXT NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE chunks (
                    id INTEGER PRIMARY KEY,
                    paper_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    page_number INTEGER
                )
                """
            )
        )
        connection.execute(text("INSERT INTO papers VALUES ('paper-1', 'Thread safety', 'paper.pdf', 'indexed')"))
        connection.execute(text("INSERT INTO chunks VALUES (1, 'paper-1', 0, 'concurrent retrieval works', 1)"))

    search = BM25Search(Session(engine))
    search.ensure_fts_table()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: search.search("concurrent"), range(32)))

    assert all(len(items) == 1 for items in results)
    assert all(items[0].paper_id == "paper-1" for items in results)
