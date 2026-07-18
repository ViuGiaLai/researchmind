import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import AITrace, Base, ChatHistory, Chunk, ImportJob, Paper
from routers.system import _percent, _percentile, _reliability_snapshot


def test_reliability_snapshot_reports_operational_quality():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        session.add_all([
            Paper(id="paper-1", filename="paper.pdf", file_path="paper.pdf", title="Paper", status="indexed"),
            Chunk(paper_id="paper-1", chunk_index=0, content="Evidence", page_number=1),
            ImportJob(filename="paper.pdf", status="ready", stage="ready", progress=100),
            AITrace(trace_id="trace-1", operation="chat", elapsed_ms=250, status="success"),
            ChatHistory(
                session_id="session-1",
                role="assistant",
                content="Answer",
                citations=json.dumps([{
                    "paper_id": "paper-1",
                    "page_valid": True,
                    "verification_status": "verified",
                }]),
            ),
        ])
        session.commit()

        snapshot = _reliability_snapshot(session, total_chunks=1, vector_chunks=1)

        assert snapshot["status"] == "healthy"
        assert snapshot["score"] == 100
        assert snapshot["ingestion"]["success_rate"] == 100.0
        assert snapshot["citations"]["mapping_rate"] == 100.0
        assert snapshot["citations"]["verification_rate"] == 100.0
        assert snapshot["ai"]["p95_ms"] == 250
        assert snapshot["issues"] == []
    finally:
        session.close()


def test_reliability_helpers_handle_empty_samples():
    assert _percent(0, 0) == 100.0
    assert _percentile([], 0.95) == 0
