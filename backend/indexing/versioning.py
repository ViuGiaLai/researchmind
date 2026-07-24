"""Index configuration fingerprints and selective reindex decisions."""
import hashlib
import json

CURRENT_SCHEMA_VERSION = 1
def index_fingerprint(*, chunk_size: int, overlap: int, embedding_model: str) -> str:
    return hashlib.sha256(json.dumps({"schema":CURRENT_SCHEMA_VERSION,"chunk_size":chunk_size,"overlap":overlap,"embedding_model":embedding_model},sort_keys=True).encode()).hexdigest()
def requires_reindex(stored_fingerprint: str, current_fingerprint: str) -> bool:
    return not stored_fingerprint or stored_fingerprint != current_fingerprint
def stage_manifest(session, manifest_model, paper_id: str, fingerprint: str):
    manifest = session.query(manifest_model).filter(manifest_model.paper_id == paper_id).first()
    if manifest is None:
        manifest = manifest_model(paper_id=paper_id, fingerprint=fingerprint, previous_fingerprint="", status="building")
        session.add(manifest)
    else:
        manifest.previous_fingerprint = manifest.fingerprint
        manifest.fingerprint = fingerprint
        manifest.status = "building"
    session.commit()
    return manifest
def commit_manifest(session, manifest) -> None:
    manifest.status = "ready"
    manifest.previous_fingerprint = ""
    session.commit()
def rollback_manifest(session, manifest) -> None:
    if manifest.previous_fingerprint:
        manifest.fingerprint = manifest.previous_fingerprint
    manifest.previous_fingerprint = ""
    manifest.status = "ready"
    session.commit()
