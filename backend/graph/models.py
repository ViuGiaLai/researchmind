"""GraphRAG data models — Entity, Relationship, Community, CommunityReport, TextUnit."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class GraphEntity:
    id: str
    title: str
    type: str | None = None
    description: str | None = None
    description_embedding: list[float] | None = None
    name_embedding: list[float] | None = None
    community_ids: list[str] | None = None
    text_unit_ids: list[str] | None = None
    rank: float = 1.0
    attributes: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "type": self.type,
            "description": self.description,
            "rank": self.rank,
            "community_ids": self.community_ids or [],
            "text_unit_ids": self.text_unit_ids or [],
        }


@dataclass
class GraphRelationship:
    id: str
    source: str
    target: str
    weight: float = 1.0
    description: str | None = None
    description_embedding: list[float] | None = None
    text_unit_ids: list[str] | None = None
    rank: float = 1.0
    attributes: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "weight": self.weight,
            "description": self.description,
            "rank": self.rank,
        }


@dataclass
class GraphCommunity:
    id: str
    title: str
    level: int = 0
    parent: str | None = None
    children: list[str] | None = None
    entity_ids: list[str] | None = None
    relationship_ids: list[str] | None = None
    text_unit_ids: list[str] | None = None
    size: int = 0
    period: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "level": self.level,
            "parent": self.parent,
            "children": self.children or [],
            "size": self.size,
        }


@dataclass
class GraphCommunityReport:
    id: str
    community_id: str
    summary: str = ""
    full_content: str = ""
    rank: float = 1.0
    full_content_embedding: list[float] | None = None
    attributes: dict[str, Any] | None = None
    size: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "community_id": self.community_id,
            "summary": self.summary,
            "full_content": self.full_content,
            "rank": self.rank,
            "size": self.size,
        }


@dataclass
class GraphTextUnit:
    id: str
    text: str
    text_embedding: list[float] | None = None
    entity_ids: list[str] | None = None
    relationship_ids: list[str] | None = None
    paper_id: str | None = None
    chunk_index: int | None = None
