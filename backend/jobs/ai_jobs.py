"""Persistent AI job state machine with cancellation, retry, and resume."""
from datetime import UTC, datetime

from db.models import AIJob

TERMINAL = {"completed", "failed", "cancelled"}
def create_job(session, job_type: str, payload: str, max_attempts: int = 3) -> AIJob:
    job = AIJob(job_type=job_type, payload=payload, max_attempts=max_attempts)
    session.add(job); session.commit(); session.refresh(job); return job
def update_job(session, job_id: str, *, status: str | None = None, progress: int | None = None, error: str = "") -> AIJob:
    job = session.query(AIJob).filter(AIJob.id == job_id).one()
    if job.status in TERMINAL: return job
    if status: job.status = status
    if progress is not None: job.progress = max(0, min(progress, 100))
    if error: job.error = error
    job.updated_at = datetime.now(UTC).replace(tzinfo=None); session.commit(); return job
def cancel_job(session, job_id: str) -> AIJob: return update_job(session, job_id, status="cancelled")
def resumable_jobs(session) -> list[AIJob]:
    return session.query(AIJob).filter(AIJob.status.in_(["queued", "running", "retrying"]), AIJob.attempts < AIJob.max_attempts).all()
