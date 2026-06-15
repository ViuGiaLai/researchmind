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
    read_status = Column(String, default="unread")  # unread / reading / read
    starred = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    indexed_at = Column(DateTime, nullable=True)


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
