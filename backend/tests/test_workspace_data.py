from sqlalchemy import text

from db.database import get_engine, get_session
from db.migrations import DEFAULT_WORKSPACE_ID, run_migrations
from db.models import Annotation, Base, Paper, ReadingProgress, ScreeningDecision, Workspace


def test_migrations_are_idempotent_and_seed_default_workspace(tmp_path):
    engine = get_engine(tmp_path / "researchmind.db")
    Base.metadata.create_all(engine)

    run_migrations(engine)
    run_migrations(engine)

    session = get_session(engine)
    try:
        assert session.query(Workspace).filter(Workspace.id == DEFAULT_WORKSPACE_ID).count() == 1
        versions = session.execute(text("SELECT version FROM schema_migrations")).all()
        assert versions == [(1,)]
    finally:
        session.close()
        engine.dispose()


def test_screening_decision_persists_stage_and_exclusion_reason(tmp_path):
    engine = get_engine(tmp_path / "researchmind.db")
    Base.metadata.create_all(engine)
    run_migrations(engine)
    session = get_session(engine)
    try:
        paper = Paper(filename="screen.pdf", file_path=str(tmp_path / "screen.pdf"))
        session.add(paper)
        session.flush()
        session.add(ScreeningDecision(
            scope_id="library",
            paper_id=paper.id,
            stage="title_abstract",
            decision="exclude",
            reason="Population does not match the protocol",
        ))
        session.commit()

        decision = session.query(ScreeningDecision).one()
        assert decision.stage == "title_abstract"
        assert decision.decision == "exclude"
        assert decision.reason == "Population does not match the protocol"
    finally:
        session.close()
        engine.dispose()


def test_annotation_and_reading_progress_are_persisted_per_paper(tmp_path):
    engine = get_engine(tmp_path / "researchmind.db")
    Base.metadata.create_all(engine)
    run_migrations(engine)
    session = get_session(engine)
    try:
        paper = Paper(filename="paper.pdf", file_path=str(tmp_path / "paper.pdf"))
        session.add(paper)
        session.flush()
        session.add(Annotation(
            paper_id=paper.id,
            page_number=7,
            quote_text="A verifiable passage",
            note="Use in the evidence matrix",
            color="blue",
        ))
        session.add(ReadingProgress(paper_id=paper.id, current_page=7, zoom=125))
        session.commit()

        annotation = session.query(Annotation).filter(Annotation.paper_id == paper.id).one()
        progress = session.query(ReadingProgress).filter(ReadingProgress.paper_id == paper.id).one()
        assert annotation.page_number == 7
        assert annotation.quote_text == "A verifiable passage"
        assert progress.current_page == 7
        assert progress.zoom == 125
    finally:
        session.close()
        engine.dispose()
