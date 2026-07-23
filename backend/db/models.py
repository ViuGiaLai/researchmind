import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Paper(Base):
    __tablename__ = "papers"

    id = Column(String, primary_key=True, default=generate_uuid)
    filename = Column(String, nullable=False)
    title = Column(String, default="")
    authors = Column(Text, default="[]")  # JSON array
    year = Column(Integer, nullable=True)
    doi = Column(String, default="")
    abstract = Column(Text, default="")
    language = Column(String, default="unknown")  # vi / en
    page_count = Column(Integer, nullable=True)
    file_size = Column(Integer, default=0)
    file_path = Column(String, nullable=False, unique=True)
    status = Column(String, default="pending")  # pending / indexing / indexed / failed
    tags = Column(Text, default="[]")  # JSON array
    notes = Column(Text, default="")
    auto_summary = Column(Text, default="")  # AI-generated summary
    auto_summary_lang = Column(String, default="")  # Language of auto_summary (vi/en/ja)
    ocr_pages_count = Column(Integer, default=0)
    ocr_pages_failed = Column(Integer, default=0)
    is_scanned = Column(Integer, default=0)
    thumbnail_path = Column(String, default="")
    read_status = Column(String, default="unread")  # unread / reading / read
    starred = Column(Integer, default=0)
    layout_stats = Column(Text, default="")  # JSON: per-page column detection stats
    created_at = Column(DateTime, server_default=func.now())
    indexed_at = Column(DateTime, nullable=True)


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id = Column(String, primary_key=True, default=generate_uuid)
    paper_id = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    source_path = Column(String, default="")
    file_path = Column(String, default="")
    status = Column(String, default="queued")
    stage = Column(String, default="queued")
    progress = Column(Integer, default=0)
    error = Column(Text, default="")
    ocr_pages_count = Column(Integer, default=0)
    ocr_pages_failed = Column(Integer, default=0)
    is_scanned = Column(Integer, default=0)
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    finished_at = Column(DateTime, nullable=True)


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(String, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    section_header = Column(String, default="")
    token_count = Column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("paper_id", "chunk_index", name="uq_paper_chunk"),)


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False)
    role = Column(String, nullable=False)  # user / assistant
    content = Column(Text, nullable=False)
    context_papers = Column(Text, default="[]")  # JSON array of paper_ids
    citations = Column(Text, default="[]")  # JSON array of citations
    model_used = Column(String, default="")
    created_at = Column(DateTime, server_default=func.now(), index=True)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)


class LLMCache(Base):
    __tablename__ = "llm_cache"

    key_hash = Column(String, primary_key=True)  # md5 hash of (model + prompt/query + context)
    prompt = Column(Text, nullable=False)
    response = Column(Text, nullable=False)  # JSON-serialized response details
    created_at = Column(DateTime, server_default=func.now())


class EmbeddingCache(Base):
    __tablename__ = "embedding_cache"

    key_hash = Column(String, primary_key=True)  # md5 hash of chunk/query text
    vector = Column(Text, nullable=False)  # JSON-serialized list of floats
    created_at = Column(DateTime, server_default=func.now())


class Collection(Base):
    __tablename__ = "collections"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CollectionPaper(Base):
    __tablename__ = "collection_papers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    collection_id = Column(String, nullable=False)
    paper_id = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("collection_id", "paper_id", name="uq_collection_paper"),)


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    query = Column(Text, nullable=False)
    filters = Column(Text, default="{}")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LivingReviewSubscription(Base):
    __tablename__ = "living_review_subscriptions"

    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    query = Column(Text, nullable=False)
    enabled = Column(Integer, nullable=False, default=1)
    last_checked_at = Column(DateTime, nullable=True)
    last_seen_paper_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_living_review_project", "project_id"),)


class ResearchArtifact(Base):
    __tablename__ = "research_artifacts"

    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    artifact_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    source_id = Column(String, nullable=False, default="")
    content = Column(Text, nullable=False, default="")
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "artifact_type IN ('note', 'evidence', 'review', 'matrix', 'report')", name="ck_research_artifact_type"
        ),
        Index("ix_research_artifact_project", "project_id"),
    )


class ReviewDraft(Base):
    __tablename__ = "review_drafts"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, default="Literature Review")
    paper_ids = Column(Text, default="[]")  # JSON array
    paper_titles = Column(Text, default="[]")  # JSON array
    outline_sections = Column(Text, default="[]")  # JSON array of {key, title, description}
    sections = Column(Text, default="{}")  # JSON object key → section data
    full_text = Column(Text, default="")
    versions = Column(
        Text, default="[]"
    )  # JSON array: [{title, paper_ids, paper_titles, outline_sections, sections, full_text, saved_at}, ...]
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EvidenceMatrixDraft(Base):
    __tablename__ = "evidence_matrix_drafts"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, default="Comparison Matrix")
    paper_ids = Column(Text, default="[]")  # JSON array
    paper_names = Column(Text, default="[]")  # JSON array
    columns = Column(Text, default="[]")  # JSON array of paper titles
    rows = Column(Text, default="[]")  # JSON array of {criterion, cells[...]}
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"

    version = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    applied_at = Column(DateTime, server_default=func.now())


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    is_default = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AITrace(Base):
    __tablename__ = "ai_traces"
    id = Column(String, primary_key=True, default=generate_uuid)
    trace_id = Column(String, nullable=False, index=True)
    operation = Column(String, nullable=False)
    elapsed_ms = Column(Integer, default=0)
    status = Column(String, default="success")
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, server_default=func.now(), index=True)


class AIJob(Base):
    __tablename__ = "ai_jobs"
    id = Column(String, primary_key=True, default=generate_uuid)
    job_type = Column(String, nullable=False, index=True)
    payload = Column(Text, default="{}")
    status = Column(String, default="queued", index=True)
    progress = Column(Integer, default=0)
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    error = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class IndexManifest(Base):
    __tablename__ = "index_manifests"
    paper_id = Column(String, primary_key=True)
    schema_version = Column(Integer, default=1)
    fingerprint = Column(String, nullable=False)
    previous_fingerprint = Column(String, default="")
    status = Column(String, default="ready")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    research_question = Column(Text, default="")
    status = Column(String, nullable=False, default="active")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="ck_project_status"),
        Index("ix_projects_workspace_id", "workspace_id"),
    )


class ProjectPaper(Base):
    __tablename__ = "project_papers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    paper_id = Column(String, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("project_id", "paper_id", name="uq_project_paper"),
        Index("ix_project_papers_paper_id", "paper_id"),
    )


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(String, primary_key=True, default=generate_uuid)
    paper_id = Column(String, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    page_number = Column(Integer, nullable=False)
    kind = Column(String, nullable=False, default="highlight")
    quote_text = Column(Text, nullable=False, default="")
    note = Column(Text, nullable=False, default="")
    color = Column(String, nullable=False, default="yellow")
    tags = Column(Text, nullable=False, default="[]")
    position = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("page_number > 0", name="ck_annotation_page"),
        CheckConstraint("kind IN ('highlight', 'note', 'quote')", name="ck_annotation_kind"),
        Index("ix_annotations_paper_page", "paper_id", "page_number"),
    )


class ReadingProgress(Base):
    __tablename__ = "reading_progress"

    paper_id = Column(String, ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True)
    current_page = Column(Integer, nullable=False, default=1)
    zoom = Column(Integer, nullable=False, default=100)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScreeningDecision(Base):
    __tablename__ = "screening_decisions"

    id = Column(String, primary_key=True, default=generate_uuid)
    scope_id = Column(String, nullable=False, default="library")
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    paper_id = Column(String, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    stage = Column(String, nullable=False, default="title_abstract")
    decision = Column(String, nullable=False)
    reason = Column(Text, nullable=False, default="")
    reviewer = Column(String, nullable=False, default="local-user")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("scope_id", "paper_id", "stage", name="uq_screening_scope_paper_stage"),
        CheckConstraint("stage IN ('title_abstract', 'full_text')", name="ck_screening_stage"),
        CheckConstraint("decision IN ('include', 'exclude', 'maybe')", name="ck_screening_decision"),
        Index("ix_screening_project_stage", "project_id", "stage"),
    )


class ReviewAuditEvent(Base):
    __tablename__ = "review_audit_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    paper_id = Column(String, ForeignKey("papers.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String, nullable=False)
    payload = Column(Text, nullable=False, default="{}")
    actor = Column(String, nullable=False, default="local-user")
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_review_audit_project_created", "project_id", "created_at"),)


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    identity = Column(String, nullable=False)
    display_name = Column(String, nullable=False, default="")
    role = Column(String, nullable=False, default="viewer")
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("workspace_id", "identity", name="uq_workspace_member"),
        CheckConstraint("role IN ('owner', 'editor', 'reviewer', 'viewer')", name="ck_workspace_member_role"),
    )


class SyncDevice(Base):
    __tablename__ = "sync_devices"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    last_seen_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())


class SyncChange(Base):
    __tablename__ = "sync_changes"

    revision = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(String, ForeignKey("sync_devices.id", ondelete="CASCADE"), nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    operation = Column(String, nullable=False)
    payload = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint("operation IN ('upsert', 'delete')", name="ck_sync_operation"),
        Index("ix_sync_workspace_revision", "workspace_id", "revision"),
    )


class AnonymizationMap(Base):
    """Lưu entity map của từng paper để có thể reverse anonymization.

    entity_map_json: JSON object { original_text: { label, entity_type, count } }
    anonymized_text: Full text đã được ẩn danh (Markdown)
    is_active: 1 nếu đang bật chế độ ẩn danh cho paper này
    """

    __tablename__ = "anonymization_maps"

    paper_id = Column(
        String,
        ForeignKey("papers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    entity_map_json = Column(Text, nullable=False, default="{}")
    anonymized_text = Column(Text, nullable=False, default="")
    is_active = Column(Integer, nullable=False, default=0)  # 0=off, 1=on
    entities_found = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_anonymization_active", "is_active"),)
