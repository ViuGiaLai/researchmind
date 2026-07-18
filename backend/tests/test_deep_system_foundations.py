import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import AIJob, Base, IndexManifest, Paper
from jobs.ai_jobs import cancel_job, create_job, resumable_jobs, update_job
from chat.claim_decomposition import decompose_claims
from chat.metadata_filters import filter_paper_ids
from chat.parent_retrieval import expand_parent_context
from chat.provider_resilience import ProviderHealth
from db.models import Chunk
from indexing.versioning import commit_manifest, index_fingerprint, rollback_manifest, stage_manifest
from search.calibration import retrieval_weights

def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()

def test_atomic_claim_decomposition_preserves_citations():
    claims = decompose_claims("Method A improved accuracy [Paper, page 2]. It reduced latency [Paper, page 3].")
    assert len(claims) == 2
    assert claims[0]["citations"] == ["[Paper, page 2]"]

def test_metadata_filtering_is_parameterized():
    session = _session()
    session.add_all([
        Paper(id="a", filename="a.pdf", file_path="a", year=2024, language="en", tags='["rag"]'),
        Paper(id="b", filename="b.pdf", file_path="b", year=2020, language="vi", tags='["other"]'),
    ]); session.commit()
    assert filter_paper_ids(session, {"year_from": 2023, "language": "en", "tags": ["rag"]}) == ["a"]

def test_parent_child_retrieval_expands_adjacent_chunks():
    session = _session()
    session.add_all([Chunk(paper_id="p", chunk_index=i, content=f"c{i}") for i in range(3)]); session.commit()
    result = expand_parent_context(session, [{"paper_id":"p","chunk_index":1,"chunk_id":"child","content":"c1"}], 1)
    assert result[0]["parent_chunk_indices"] == [0, 1, 2]
    assert result[0]["child_chunk_id"] == "child"

def test_hybrid_calibration_changes_by_intent():
    assert retrieval_weights('DOI "exact phrase"')[0] > retrieval_weights("explain this concept")[0]

def test_quality_routing_prefers_healthy_provider():
    health = ProviderHealth()
    health.record("slow", True, 2000); health.record("fast", True, 20)
    assert health.rank(["slow", "fast"])[0] == "fast"

def test_persistent_job_cancel_and_resume():
    session = _session(); job = create_job(session, "review", json.dumps({"paper_ids":["p"]}))
    update_job(session, job.id, status="running", progress=25)
    assert resumable_jobs(session)[0].progress == 25
    assert cancel_job(session, job.id).status == "cancelled"
    assert resumable_jobs(session) == []

def test_index_manifest_commit_and_rollback():
    session = _session(); first = index_fingerprint(chunk_size=500, overlap=50, embedding_model="a")
    manifest = stage_manifest(session, IndexManifest, "p", first); commit_manifest(session, manifest)
    second = index_fingerprint(chunk_size=700, overlap=50, embedding_model="a")
    manifest = stage_manifest(session, IndexManifest, "p", second); rollback_manifest(session, manifest)
    assert manifest.fingerprint == first and manifest.status == "ready"
