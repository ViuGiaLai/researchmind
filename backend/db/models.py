from sqlalchemy import (
    Column, String, Integer, Text, DateTime, func,
    UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import DeclarativeBase
import uuid


class Base(DeclarativeBase):
    pass


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Paper(Base):
    __tablename__ = "papers"

    id = Column(String, primary_key=True, default=generate_uuid)
    filename = Column(String, nullable=False)
    title = Column(String, default="")
    authors = Column(Text, default="[]")          # JSON array
    year = Column(Integer, nullable=True)
    doi = Column(String, default="")
    abstract = Column(Text, default="")
    language = Column(String, default="unknown")  # vi / en
    page_count = Column(Integer, nullable=True)
    file_size = Column(Integer, default=0)
    file_path = Column(String, nullable=False, unique=True)
    status = Column(String, default="pending")    # pending / indexing / indexed / failed
    tags = Column(Text, default="[]")             # JSON array
    notes = Column(Text, default="")
    auto_summary = Column(Text, default="")  # AI-generated summary
    ocr_pages_count = Column(Integer, default=0)
    ocr_pages_failed = Column(Integer, default=0)
    is_scanned = Column(Integer, default=0)
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

    __table_args__ = (
        UniqueConstraint("paper_id", "chunk_index", name="uq_paper_chunk"),
    )


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False)
    role = Column(String, nullable=False)  # user / assistant
    content = Column(Text, nullable=False)
    context_papers = Column(Text, default="[]")  # JSON array of paper_ids
    citations = Column(Text, default="[]")        # JSON array of citations
    model_used = Column(String, default="")
    created_at = Column(DateTime, server_default=func.now())


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

    __table_args__ = (
        UniqueConstraint("collection_id", "paper_id", name="uq_collection_paper"),
    )


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    query = Column(Text, nullable=False)
    filters = Column(Text, default="{}")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ReviewDraft(Base):
    __tablename__ = "review_drafts"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, default="Literature Review")
    paper_ids = Column(Text, default="[]")         # JSON array
    paper_titles = Column(Text, default="[]")       # JSON array
    outline_sections = Column(Text, default="[]")   # JSON array of {key, title, description}
    sections = Column(Text, default="{}")           # JSON object key → section data
    full_text = Column(Text, default="")
    versions = Column(Text, default="[]")  # JSON array: [{title, paper_ids, paper_titles, outline_sections, sections, full_text, saved_at}, ...]
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EvidenceMatrixDraft(Base):
    __tablename__ = "evidence_matrix_drafts"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, default="Ma trận so sánh")
    paper_ids = Column(Text, default="[]")         # JSON array
    paper_names = Column(Text, default="[]")        # JSON array
    columns = Column(Text, default="[]")            # JSON array of paper titles
    rows = Column(Text, default="[]")               # JSON array of {criterion, cells[...]}
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
