"""In-memory knowledge graph store with optional JSON persistence."""

from __future__ import annotations
import json
import uuid
from pathlib import Path
from dataclasses import dataclass, field, is_dataclass, asdict
from typing import Any

from loguru import logger

from .models import (
    GraphEntity,
    GraphRelationship,
    GraphCommunity,
    GraphCommunityReport,
    GraphTextUnit,
)


def _serialize_dataclass(obj: Any) -> dict[str, Any]:
    """Convert a dataclass to a dict, skipping None values."""
    if not is_dataclass(obj):
        return {}
    return {k: v for k, v in asdict(obj).items() if v is not None}


class _GraphEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles dataclasses and UUIDs."""
    def default(self, obj: Any) -> Any:
        if is_dataclass(obj):
            return {k: v for k, v in asdict(obj).items() if v is not None}
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, set):
            return list(obj)
        return super().default(obj)


@dataclass
class KnowledgeGraph:
    entities: dict[str, GraphEntity] = field(default_factory=dict)
    relationships: dict[str, GraphRelationship] = field(default_factory=dict)
    communities: dict[str, GraphCommunity] = field(default_factory=dict)
    community_reports: dict[str, GraphCommunityReport] = field(default_factory=dict)
    text_units: dict[str, GraphTextUnit] = field(default_factory=dict)

    def add_entity(self, entity: GraphEntity) -> None:
        self.entities[entity.id] = entity

    def add_relationship(self, rel: GraphRelationship) -> None:
        self.relationships[rel.id] = rel

    def add_community(self, community: GraphCommunity) -> None:
        self.communities[community.id] = community

    def add_community_report(self, report: GraphCommunityReport) -> None:
        self.community_reports[report.community_id] = report

    def add_text_unit(self, tu: GraphTextUnit) -> None:
        self.text_units[tu.id] = tu

    def get_entity_by_title(self, title: str) -> GraphEntity | None:
        for e in self.entities.values():
            if e.title.upper() == title.upper():
                return e
        return None

    def get_relationships_for_entity(self, title: str) -> list[GraphRelationship]:
        return [
            r for r in self.relationships.values()
            if r.source.upper() == title.upper() or r.target.upper() == title.upper()
        ]

    def get_neighbor_entities(self, title: str) -> list[GraphEntity]:
        rels = self.get_relationships_for_entity(title)
        neighbor_titles: set[str] = set()
        for r in rels:
            if r.source.upper() == title.upper():
                neighbor_titles.add(r.target)
            else:
                neighbor_titles.add(r.source)
        return [e for e in self.entities.values() if e.title.upper() in {t.upper() for t in neighbor_titles}]

    def clear(self) -> None:
        self.entities.clear()
        self.relationships.clear()
        self.communities.clear()
        self.community_reports.clear()
        self.text_units.clear()

    def stats(self) -> dict[str, int]:
        return {
            "entities": len(self.entities),
            "relationships": len(self.relationships),
            "communities": len(self.communities),
            "community_reports": len(self.community_reports),
            "text_units": len(self.text_units),
        }


class GraphStore:
    """Persistence layer for KnowledgeGraph — JSON-based."""

    def __init__(self, path: Path | None = None):
        self.graph = KnowledgeGraph()
        self._path = path

    def load(self) -> None:
        if not self._path or not self._path.exists():
            logger.info("No existing graph store found, starting fresh")
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            for e_data in data.get("entities", []):
                self.graph.add_entity(GraphEntity(**e_data))
            for r_data in data.get("relationships", []):
                self.graph.add_relationship(GraphRelationship(**r_data))
            for c_data in data.get("communities", []):
                self.graph.add_community(GraphCommunity(**c_data))
            for cr_data in data.get("community_reports", []):
                self.graph.add_community_report(GraphCommunityReport(**cr_data))
            for tu_data in data.get("text_units", []):
                self.graph.add_text_unit(GraphTextUnit(**tu_data))
            logger.info(f"Loaded graph store: {self.graph.stats()}")
        except Exception as e:
            logger.error(f"Failed to load graph store: {e}")

    def save(self) -> None:
        if not self._path:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "entities": [_serialize_dataclass(e) for e in self.graph.entities.values()],
            "relationships": [_serialize_dataclass(r) for r in self.graph.relationships.values()],
            "communities": [_serialize_dataclass(c) for c in self.graph.communities.values()],
            "community_reports": [_serialize_dataclass(cr) for cr in self.graph.community_reports.values()],
            "text_units": [_serialize_dataclass(tu) for tu in self.graph.text_units.values()],
        }
        self._path.write_text(json.dumps(data, ensure_ascii=False, indent=2, cls=_GraphEncoder), encoding="utf-8")
        logger.info(f"Saved graph store: {self.graph.stats()}")

    def clear_all(self) -> None:
        self.graph.clear()
        self.save()
