"""Thread-safe in-memory knowledge graph with atomic JSON persistence."""

from __future__ import annotations

import json
import os
import threading
import uuid
from dataclasses import asdict, dataclass, field, is_dataclass
from pathlib import Path
from typing import Any

from loguru import logger

from .models import (
    GraphCommunity,
    GraphCommunityReport,
    GraphEntity,
    GraphRelationship,
    GraphTextUnit,
)


def _serialize_dataclass(obj: Any) -> dict[str, Any]:
    if not is_dataclass(obj):
        return {}
    return {key: value for key, value in asdict(obj).items() if value is not None}


class _GraphEncoder(json.JSONEncoder):
    def default(self, obj: Any) -> Any:
        if is_dataclass(obj):
            return {key: value for key, value in asdict(obj).items() if value is not None}
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, set):
            return sorted(obj)
        return super().default(obj)


@dataclass
class KnowledgeGraph:
    entities: dict[str, GraphEntity] = field(default_factory=dict)
    relationships: dict[str, GraphRelationship] = field(default_factory=dict)
    communities: dict[str, GraphCommunity] = field(default_factory=dict)
    community_reports: dict[str, GraphCommunityReport] = field(default_factory=dict)
    text_units: dict[str, GraphTextUnit] = field(default_factory=dict)
    _lock: threading.RLock = field(
        default_factory=threading.RLock,
        init=False,
        repr=False,
        compare=False,
    )

    def add_entity(self, entity: GraphEntity) -> None:
        with self._lock:
            self.entities[entity.id] = entity

    def add_relationship(self, rel: GraphRelationship) -> None:
        with self._lock:
            self.relationships[rel.id] = rel

    def add_community(self, community: GraphCommunity) -> None:
        with self._lock:
            self.communities[community.id] = community

    def add_community_report(self, report: GraphCommunityReport) -> None:
        with self._lock:
            self.community_reports[report.community_id] = report

    def add_text_unit(self, text_unit: GraphTextUnit) -> None:
        with self._lock:
            self.text_units[text_unit.id] = text_unit

    def get_entity_by_title(self, title: str) -> GraphEntity | None:
        normalized = title.casefold()
        with self._lock:
            return next(
                (entity for entity in self.entities.values() if entity.title.casefold() == normalized),
                None,
            )

    def get_relationships_for_entity(self, title: str) -> list[GraphRelationship]:
        normalized = title.casefold()
        with self._lock:
            return [
                relationship
                for relationship in self.relationships.values()
                if relationship.source.casefold() == normalized or relationship.target.casefold() == normalized
            ]

    def get_neighbor_entities(self, title: str) -> list[GraphEntity]:
        normalized = title.casefold()
        with self._lock:
            neighbor_titles: set[str] = set()
            for relationship in self.relationships.values():
                if relationship.source.casefold() == normalized:
                    neighbor_titles.add(relationship.target.casefold())
                elif relationship.target.casefold() == normalized:
                    neighbor_titles.add(relationship.source.casefold())
            return [entity for entity in self.entities.values() if entity.title.casefold() in neighbor_titles]

    def clear(self) -> None:
        with self._lock:
            self.entities.clear()
            self.relationships.clear()
            self.communities.clear()
            self.community_reports.clear()
            self.text_units.clear()

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "entities": len(self.entities),
                "relationships": len(self.relationships),
                "communities": len(self.communities),
                "community_reports": len(self.community_reports),
                "text_units": len(self.text_units),
            }

    def snapshot(self) -> dict[str, list[dict[str, Any]]]:
        """Return a consistent serialization snapshot while mutations are paused."""
        with self._lock:
            return {
                "entities": [_serialize_dataclass(entity) for entity in self.entities.values()],
                "relationships": [_serialize_dataclass(relationship) for relationship in self.relationships.values()],
                "communities": [_serialize_dataclass(community) for community in self.communities.values()],
                "community_reports": [_serialize_dataclass(report) for report in self.community_reports.values()],
                "text_units": [_serialize_dataclass(text_unit) for text_unit in self.text_units.values()],
            }


class GraphStore:
    """Persistence layer that never exposes a partially written graph file."""

    def __init__(self, path: Path | None = None):
        self.graph = KnowledgeGraph()
        self._path = path
        self._io_lock = threading.RLock()

    def load(self) -> None:
        if not self._path or not self._path.exists():
            logger.info("No existing graph store found, starting fresh")
            return

        try:
            with self._io_lock:
                data = json.loads(self._path.read_text(encoding="utf-8"))
                if not isinstance(data, dict):
                    raise ValueError("Graph store root must be an object")

                loaded = KnowledgeGraph()
                for item in data.get("entities", []):
                    loaded.add_entity(GraphEntity(**item))
                for item in data.get("relationships", []):
                    loaded.add_relationship(GraphRelationship(**item))
                for item in data.get("communities", []):
                    loaded.add_community(GraphCommunity(**item))
                for item in data.get("community_reports", []):
                    loaded.add_community_report(GraphCommunityReport(**item))
                for item in data.get("text_units", []):
                    loaded.add_text_unit(GraphTextUnit(**item))
                self.graph = loaded
            logger.info(f"Loaded graph store: {self.graph.stats()}")
        except Exception as exc:
            # Keep the last valid in-memory graph instead of partially applying
            # a corrupt file.
            logger.error(f"Failed to load graph store: {exc}")

    def save(self) -> None:
        if not self._path:
            return

        with self._io_lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            payload = json.dumps(
                self.graph.snapshot(),
                ensure_ascii=False,
                indent=2,
                cls=_GraphEncoder,
            )
            temp_path = self._path.with_name(f".{self._path.name}.{uuid.uuid4().hex}.tmp")
            try:
                with temp_path.open("w", encoding="utf-8", newline="\n") as handle:
                    handle.write(payload)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_path, self._path)
            finally:
                if temp_path.exists():
                    temp_path.unlink(missing_ok=True)
        logger.info(f"Saved graph store: {self.graph.stats()}")

    def clear_all(self) -> None:
        self.graph.clear()
        self.save()
