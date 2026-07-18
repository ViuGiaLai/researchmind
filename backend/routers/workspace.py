import json
import os
import sqlite3
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

from app_state import state
from config.settings import settings
from db.database import get_session
from db.migrations import DEFAULT_WORKSPACE_ID
from db.models import (
    Annotation, Paper, Project, ProjectPaper, ReadingProgress, ReviewAuditEvent,
    ScreeningDecision, SyncChange, SyncDevice, Workspace, WorkspaceMember,
)

router = APIRouter(prefix="/api", tags=["Workspace"])

SYNC_ENTITY_TYPES = {"project", "project_paper", "annotation", "screening_decision", "review_draft"}


def _iso(value):
    return value.isoformat() if value else None


def _annotation_dict(item: Annotation) -> dict:
    return {
        "id": item.id,
        "paper_id": item.paper_id,
        "project_id": item.project_id,
        "page_number": item.page_number,
        "kind": item.kind,
        "quote_text": item.quote_text,
        "note": item.note,
        "color": item.color,
        "tags": json.loads(item.tags or "[]"),
        "position": json.loads(item.position or "{}"),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


@router.get("/workspaces")
async def list_workspaces():
    session = get_session(state.engine)
    try:
        rows = session.query(Workspace).order_by(Workspace.is_default.desc(), Workspace.created_at).all()
        return {"workspaces": [
            {"id": row.id, "name": row.name, "is_default": bool(row.is_default), "created_at": _iso(row.created_at)}
            for row in rows
        ]}
    finally:
        session.close()


@router.get("/integrations/capabilities")
async def integration_capabilities():
    return {
        "imports": ["pdf", "docx", "markdown", "bibtex", "zotero_csv", "zotero_sqlite"],
        "exports": ["markdown", "html", "docx", "pdf", "bibtex", "apa", "ieee", "vancouver"],
        "connectors": {
            "zotero": {"status": "available", "direction": "import"},
            "obsidian": {"status": "file_export", "format": "markdown"},
            "word": {"status": "document_export", "format": "docx"},
            "latex": {"status": "bibliography_export", "format": "bibtex"},
        },
    }


@router.get("/workspaces/{workspace_id}/members")
async def list_workspace_members(workspace_id: str):
    session = get_session(state.engine)
    try:
        rows = session.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()
        return {"members": [{
            "id": row.id, "identity": row.identity, "display_name": row.display_name,
            "role": row.role, "created_at": _iso(row.created_at),
        } for row in rows]}
    finally:
        session.close()


@router.post("/workspaces/{workspace_id}/members")
async def add_workspace_member(workspace_id: str, body: dict = Body(...)):
    identity = str(body.get("identity") or "").strip().lower()
    role = body.get("role") or "viewer"
    if not identity or role not in {"owner", "editor", "reviewer", "viewer"}:
        raise HTTPException(status_code=400, detail="Valid identity and role are required")
    session = get_session(state.engine)
    try:
        if not session.query(Workspace).filter(Workspace.id == workspace_id).first():
            raise HTTPException(status_code=404, detail="Workspace not found")
        existing = session.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.identity == identity
        ).first()
        if existing:
            existing.role = role
            existing.display_name = str(body.get("display_name") or existing.display_name)
            member = existing
        else:
            member = WorkspaceMember(
                workspace_id=workspace_id, identity=identity,
                display_name=str(body.get("display_name") or ""), role=role,
            )
            session.add(member)
        session.commit()
        session.refresh(member)
        return {"id": member.id, "identity": member.identity, "role": member.role}
    finally:
        session.close()


@router.post("/sync/devices")
async def register_sync_device(body: dict = Body(...)):
    device_id = str(body.get("device_id") or "").strip()
    name = str(body.get("name") or "").strip()
    if not device_id or not name:
        raise HTTPException(status_code=400, detail="device_id and name are required")
    session = get_session(state.engine)
    try:
        device = session.query(SyncDevice).filter(SyncDevice.id == device_id).first()
        if device:
            device.name, device.last_seen_at = name, datetime.utcnow()
        else:
            device = SyncDevice(id=device_id, name=name)
            session.add(device)
        session.commit()
        return {"device_id": device_id, "registered": True}
    finally:
        session.close()


@router.post("/sync/changes")
async def push_sync_changes(body: dict = Body(...)):
    workspace_id = str(body.get("workspace_id") or DEFAULT_WORKSPACE_ID)
    device_id = str(body.get("device_id") or "")
    changes = body.get("changes") or []
    session = get_session(state.engine)
    try:
        if not session.query(SyncDevice).filter(SyncDevice.id == device_id).first():
            raise HTTPException(status_code=404, detail="Sync device is not registered")
        accepted = 0
        for change in changes[:500]:
            entity_type = change.get("entity_type")
            operation = change.get("operation")
            entity_id = str(change.get("entity_id") or "")
            if entity_type not in SYNC_ENTITY_TYPES or operation not in {"upsert", "delete"} or not entity_id:
                continue
            session.add(SyncChange(
                workspace_id=workspace_id, device_id=device_id, entity_type=entity_type,
                entity_id=entity_id, operation=operation,
                payload=json.dumps(change.get("payload") or {}, ensure_ascii=False),
            ))
            accepted += 1
        session.commit()
        latest = session.query(SyncChange.revision).order_by(SyncChange.revision.desc()).first()
        return {"accepted": accepted, "revision": latest[0] if latest else 0}
    finally:
        session.close()


@router.get("/sync/changes")
async def pull_sync_changes(workspace_id: str = DEFAULT_WORKSPACE_ID, after: int = 0, limit: int = 200):
    session = get_session(state.engine)
    try:
        rows = session.query(SyncChange).filter(
            SyncChange.workspace_id == workspace_id, SyncChange.revision > max(after, 0)
        ).order_by(SyncChange.revision).limit(min(max(limit, 1), 500)).all()
        return {"changes": [{
            "revision": row.revision, "device_id": row.device_id, "entity_type": row.entity_type,
            "entity_id": row.entity_id, "operation": row.operation,
            "payload": json.loads(row.payload or "{}"), "created_at": _iso(row.created_at),
        } for row in rows], "cursor": rows[-1].revision if rows else after}
    finally:
        session.close()


@router.get("/projects")
async def list_projects(workspace_id: str = DEFAULT_WORKSPACE_ID):
    session = get_session(state.engine)
    try:
        projects = session.query(Project).filter(Project.workspace_id == workspace_id).order_by(Project.updated_at.desc()).all()
        return {"projects": [{
            "id": project.id,
            "workspace_id": project.workspace_id,
            "title": project.title,
            "description": project.description,
            "research_question": project.research_question,
            "status": project.status,
            "paper_count": session.query(ProjectPaper).filter(ProjectPaper.project_id == project.id).count(),
            "created_at": _iso(project.created_at),
            "updated_at": _iso(project.updated_at),
        } for project in projects]}
    finally:
        session.close()


@router.post("/projects")
async def create_project(body: dict = Body(...)):
    title = str(body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Project title is required")
    session = get_session(state.engine)
    try:
        workspace_id = body.get("workspace_id") or DEFAULT_WORKSPACE_ID
        if not session.query(Workspace).filter(Workspace.id == workspace_id).first():
            raise HTTPException(status_code=404, detail="Workspace not found")
        project = Project(
            workspace_id=workspace_id,
            title=title,
            description=str(body.get("description") or "").strip(),
            research_question=str(body.get("research_question") or "").strip(),
        )
        session.add(project)
        session.commit()
        session.refresh(project)
        return {"id": project.id, "workspace_id": project.workspace_id, "title": project.title}
    finally:
        session.close()


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    session = get_session(state.engine)
    try:
        project = session.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        paper_ids = [
            row[0] for row in session.query(ProjectPaper.paper_id)
            .filter(ProjectPaper.project_id == project_id).all()
        ]
        papers = session.query(Paper).filter(Paper.id.in_(paper_ids)).all() if paper_ids else []
        evidence = session.query(Annotation).filter(Annotation.project_id == project_id).order_by(
            Annotation.updated_at.desc()
        ).all()
        return {
            "id": project.id,
            "workspace_id": project.workspace_id,
            "title": project.title,
            "description": project.description,
            "research_question": project.research_question,
            "status": project.status,
            "papers": [{
                "id": paper.id,
                "title": paper.title or paper.filename,
                "authors": json.loads(paper.authors or "[]"),
                "year": paper.year,
                "page_count": paper.page_count,
                "status": paper.status,
            } for paper in papers],
            "evidence": [_annotation_dict(item) for item in evidence],
            "created_at": _iso(project.created_at),
            "updated_at": _iso(project.updated_at),
        }
    finally:
        session.close()


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    session = get_session(state.engine)
    try:
        project = session.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        session.delete(project)
        session.commit()
        return {"status": "deleted"}
    finally:
        session.close()


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, body: dict = Body(...)):
    session = get_session(state.engine)
    try:
        project = session.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if "title" in body:
            title = str(body.get("title") or "").strip()
            if not title:
                raise HTTPException(status_code=400, detail="Project title is required")
            project.title = title
        for key in ("description", "research_question"):
            if key in body:
                setattr(project, key, str(body.get(key) or "").strip())
        if body.get("status") in {"active", "archived"}:
            project.status = body["status"]
        project.updated_at = datetime.utcnow()
        session.commit()
        return {"id": project.id, "title": project.title, "status": project.status}
    finally:
        session.close()


@router.post("/projects/{project_id}/papers")
async def add_project_papers(project_id: str, body: dict = Body(...)):
    paper_ids = list(dict.fromkeys(body.get("paper_ids") or []))
    session = get_session(state.engine)
    try:
        if not session.query(Project).filter(Project.id == project_id).first():
            raise HTTPException(status_code=404, detail="Project not found")
        valid = {row[0] for row in session.query(Paper.id).filter(Paper.id.in_(paper_ids)).all()}
        existing = {row[0] for row in session.query(ProjectPaper.paper_id).filter(
            ProjectPaper.project_id == project_id, ProjectPaper.paper_id.in_(valid)
        ).all()}
        for paper_id in valid - existing:
            session.add(ProjectPaper(project_id=project_id, paper_id=paper_id))
        session.commit()
        return {"added": len(valid - existing)}
    finally:
        session.close()


def _screening_scope(project_id: str | None) -> str:
    return f"project:{project_id}" if project_id else "library"


@router.get("/screening/decisions")
async def list_screening_decisions(project_id: str | None = None, stage: str = "title_abstract"):
    session = get_session(state.engine)
    try:
        rows = session.query(ScreeningDecision).filter(
            ScreeningDecision.scope_id == _screening_scope(project_id),
            ScreeningDecision.stage == stage,
        ).all()
        return {"decisions": [{
            "paper_id": row.paper_id,
            "project_id": row.project_id,
            "stage": row.stage,
            "decision": row.decision,
            "reason": row.reason,
            "reviewer": row.reviewer,
            "updated_at": _iso(row.updated_at),
        } for row in rows]}
    finally:
        session.close()


@router.put("/screening/decisions/{paper_id}")
async def save_screening_decision(paper_id: str, body: dict = Body(...)):
    decision = body.get("decision")
    stage = body.get("stage") or "title_abstract"
    if decision not in {"include", "exclude", "maybe"} or stage not in {"title_abstract", "full_text"}:
        raise HTTPException(status_code=400, detail="Invalid screening decision or stage")
    reason = str(body.get("reason") or "").strip()
    if decision == "exclude" and not reason:
        raise HTTPException(status_code=400, detail="Exclusion reason is required")
    project_id = body.get("project_id") or None
    scope_id = _screening_scope(project_id)
    session = get_session(state.engine)
    try:
        if not session.query(Paper).filter(Paper.id == paper_id).first():
            raise HTTPException(status_code=404, detail="Paper not found")
        row = session.query(ScreeningDecision).filter(
            ScreeningDecision.scope_id == scope_id,
            ScreeningDecision.paper_id == paper_id,
            ScreeningDecision.stage == stage,
        ).first()
        before = row.decision if row else None
        if row:
            row.decision, row.reason = decision, reason
            row.updated_at = datetime.utcnow()
        else:
            row = ScreeningDecision(
                scope_id=scope_id, project_id=project_id, paper_id=paper_id,
                stage=stage, decision=decision, reason=reason,
            )
            session.add(row)
        session.add(ReviewAuditEvent(
            project_id=project_id,
            paper_id=paper_id,
            event_type="screening_decision",
            payload=json.dumps({"stage": stage, "before": before, "after": decision, "reason": reason}, ensure_ascii=False),
        ))
        session.commit()
        return {"paper_id": paper_id, "decision": decision, "reason": reason, "stage": stage}
    finally:
        session.close()


@router.delete("/screening/decisions/{paper_id}")
async def clear_screening_decision(paper_id: str, project_id: str | None = None, stage: str = "title_abstract"):
    session = get_session(state.engine)
    try:
        deleted = session.query(ScreeningDecision).filter(
            ScreeningDecision.scope_id == _screening_scope(project_id),
            ScreeningDecision.paper_id == paper_id,
            ScreeningDecision.stage == stage,
        ).delete()
        if deleted:
            session.add(ReviewAuditEvent(
                project_id=project_id, paper_id=paper_id, event_type="screening_cleared",
                payload=json.dumps({"stage": stage}),
            ))
        session.commit()
        return {"deleted": deleted}
    finally:
        session.close()


@router.get("/screening/prisma")
async def get_prisma_counts(project_id: str | None = None):
    session = get_session(state.engine)
    try:
        if project_id:
            identified = session.query(ProjectPaper).filter(ProjectPaper.project_id == project_id).count()
        else:
            identified = session.query(Paper).count()
        rows = session.query(ScreeningDecision).filter(
            ScreeningDecision.scope_id == _screening_scope(project_id)
        ).all()
        title_rows = [row for row in rows if row.stage == "title_abstract"]
        full_rows = [row for row in rows if row.stage == "full_text"]
        return {
            "identified": identified,
            "duplicates_removed": 0,
            "screened": len(title_rows),
            "title_abstract_excluded": sum(row.decision == "exclude" for row in title_rows),
            "full_text_assessed": len(full_rows),
            "full_text_excluded": sum(row.decision == "exclude" for row in full_rows),
            "included": sum(row.decision == "include" for row in (full_rows or title_rows)),
            "awaiting_screening": max(identified - len(title_rows), 0),
        }
    finally:
        session.close()


@router.get("/projects/{project_id}/audit")
async def get_project_audit(project_id: str):
    session = get_session(state.engine)
    try:
        rows = session.query(ReviewAuditEvent).filter(
            ReviewAuditEvent.project_id == project_id
        ).order_by(ReviewAuditEvent.created_at.desc()).limit(500).all()
        return {"events": [{
            "id": row.id, "paper_id": row.paper_id, "event_type": row.event_type,
            "payload": json.loads(row.payload or "{}"), "actor": row.actor, "created_at": _iso(row.created_at),
        } for row in rows]}
    finally:
        session.close()


@router.get("/papers/{paper_id}/annotations")
async def list_annotations(paper_id: str):
    session = get_session(state.engine)
    try:
        rows = session.query(Annotation).filter(Annotation.paper_id == paper_id).order_by(
            Annotation.page_number, Annotation.created_at
        ).all()
        return {"annotations": [_annotation_dict(row) for row in rows]}
    finally:
        session.close()


@router.post("/papers/{paper_id}/annotations")
async def create_annotation(paper_id: str, body: dict = Body(...)):
    page = int(body.get("page_number") or 0)
    quote = str(body.get("quote_text") or "").strip()
    note = str(body.get("note") or "").strip()
    if page < 1 or not (quote or note):
        raise HTTPException(status_code=400, detail="A page and quote or note are required")
    session = get_session(state.engine)
    try:
        if not session.query(Paper).filter(Paper.id == paper_id).first():
            raise HTTPException(status_code=404, detail="Paper not found")
        item = Annotation(
            paper_id=paper_id,
            project_id=body.get("project_id") or None,
            page_number=page,
            kind=body.get("kind") if body.get("kind") in {"highlight", "note", "quote"} else "highlight",
            quote_text=quote,
            note=note,
            color=body.get("color") if body.get("color") in {"yellow", "green", "blue", "pink"} else "yellow",
            tags=json.dumps(body.get("tags") or [], ensure_ascii=False),
            position=json.dumps(body.get("position") or {}, ensure_ascii=False),
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return _annotation_dict(item)
    finally:
        session.close()


@router.patch("/annotations/{annotation_id}")
async def update_annotation(annotation_id: str, body: dict = Body(...)):
    session = get_session(state.engine)
    try:
        item = session.query(Annotation).filter(Annotation.id == annotation_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Annotation not found")
        for key in ("quote_text", "note"):
            if key in body:
                setattr(item, key, str(body[key] or "").strip())
        if body.get("color") in {"yellow", "green", "blue", "pink"}:
            item.color = body["color"]
        if "tags" in body:
            item.tags = json.dumps(body.get("tags") or [], ensure_ascii=False)
        item.updated_at = datetime.utcnow()
        session.commit()
        return _annotation_dict(item)
    finally:
        session.close()


@router.delete("/annotations/{annotation_id}")
async def delete_annotation(annotation_id: str):
    session = get_session(state.engine)
    try:
        deleted = session.query(Annotation).filter(Annotation.id == annotation_id).delete()
        session.commit()
        if not deleted:
            raise HTTPException(status_code=404, detail="Annotation not found")
        return {"status": "deleted"}
    finally:
        session.close()


@router.get("/papers/{paper_id}/reading-progress")
async def get_reading_progress(paper_id: str):
    session = get_session(state.engine)
    try:
        progress = session.query(ReadingProgress).filter(ReadingProgress.paper_id == paper_id).first()
        return {"paper_id": paper_id, "current_page": progress.current_page if progress else 1, "zoom": progress.zoom if progress else 100}
    finally:
        session.close()


@router.put("/papers/{paper_id}/reading-progress")
async def save_reading_progress(paper_id: str, body: dict = Body(...)):
    page = max(1, int(body.get("current_page") or 1))
    zoom = max(50, min(300, int(body.get("zoom") or 100)))
    session = get_session(state.engine)
    try:
        progress = session.query(ReadingProgress).filter(ReadingProgress.paper_id == paper_id).first()
        if progress:
            progress.current_page, progress.zoom = page, zoom
            progress.updated_at = datetime.utcnow()
        else:
            progress = ReadingProgress(paper_id=paper_id, current_page=page, zoom=zoom)
            session.add(progress)
        session.commit()
        return {"paper_id": paper_id, "current_page": page, "zoom": zoom}
    finally:
        session.close()


def _backup_dir() -> Path:
    path = settings.data_dir / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.get("/backups")
async def list_backups():
    items = []
    for path in sorted(_backup_dir().glob("researchmind-*.zip"), reverse=True):
        stat = path.stat()
        items.append({"name": path.name, "size": stat.st_size, "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()})
    return {"backups": items}


@router.post("/backups")
async def create_backup():
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = _backup_dir() / f"researchmind-{stamp}.zip"
    with tempfile.TemporaryDirectory(dir=_backup_dir()) as tmp:
        snapshot = Path(tmp) / "researchmind.db"
        source = sqlite3.connect(str(settings.db_path))
        destination = sqlite3.connect(str(snapshot))
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        archive = Path(tmp) / "backup.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.write(snapshot, "database/researchmind.db")
            bundle.writestr("manifest.json", json.dumps({"version": 1, "created_at": datetime.now().isoformat()}))
        os.replace(archive, target)
    return {"name": target.name, "size": target.stat().st_size}


@router.post("/backups/{backup_name}/restore")
async def queue_restore(backup_name: str):
    if Path(backup_name).name != backup_name:
        raise HTTPException(status_code=400, detail="Invalid backup name")
    source = _backup_dir() / backup_name
    if not source.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    pending = settings.db_path.parent / ".restore-pending.db"
    with zipfile.ZipFile(source) as bundle:
        if "database/researchmind.db" not in bundle.namelist():
            raise HTTPException(status_code=400, detail="Invalid backup")
        with bundle.open("database/researchmind.db") as src, open(pending, "wb") as dst:
            while chunk := src.read(1024 * 1024):
                dst.write(chunk)
    return {"status": "queued", "requires_restart": True}
