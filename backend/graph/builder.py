"""Knowledge graph builder — orchestrates extraction, clustering, and summarization.

MIT License — adapted from microsoft/graphrag.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from loguru import logger

from app_state import state
from common.i18n import t as _t

from .cluster import detect_communities
from .errors import GraphBuildCancelled
from .extractor import extract_entities_and_relationships
from .models import (
    GraphEntity,
    GraphRelationship,
    GraphTextUnit,
)
from .storage import GraphStore, KnowledgeGraph
from .summarizer import summarize_community


def _set_progress(phase: str, current: int, total: int, message: str, lang: str = "vi"):
    pct = int((current / total) * 100) if total > 0 else 0
    state.build_progress = {
        "phase": phase,
        "current": current,
        "total": total,
        "percent": pct,
        "message": message,
        "lang": lang,
    }


def _ensure_not_cancelled() -> None:
    if state.build_cancelled:
        raise GraphBuildCancelled("Build cancelled by user")


async def _cancel_active_tasks() -> None:
    tasks = list(getattr(state, "build_tasks", []))
    for task in tasks:
        if not task.done():
            task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    state.build_tasks = []


def _deduplicate_entities_into_graph(
    graph: KnowledgeGraph,
    new_entities: list[GraphEntity],
) -> None:
    """Merge new entities into the graph, updating descriptions for duplicates."""
    for ne in new_entities:
        existing = graph.get_entity_by_title(ne.title)
        if existing:
            existing.type = existing.type or ne.type
            if ne.description and ne.description not in (existing.description or ""):
                existing.description = (existing.description or "") + "; " + ne.description
            if ne.text_unit_ids:
                existing.text_unit_ids = list(set(existing.text_unit_ids or []) | set(ne.text_unit_ids))
            existing.rank = max(existing.rank or 1.0, ne.rank or 1.0) + 0.1
        else:
            graph.add_entity(ne)


def _deduplicate_relationships_into_graph(
    graph: KnowledgeGraph,
    new_relationships: list[GraphRelationship],
) -> None:
    """Merge new relationships, updating weights for duplicates."""
    seen: set[tuple[str, str]] = set()
    for nr in new_relationships:
        key = (nr.source, nr.target)
        if key in seen:
            continue
        seen.add(key)
        reverse_key = (nr.target, nr.source)
        if reverse_key in seen:
            continue

        existing_rel = None
        for rel in graph.relationships.values():
            if (rel.source == nr.source and rel.target == nr.target) or \
               (rel.source == nr.target and rel.target == nr.source):
                existing_rel = rel
                break

        if existing_rel:
            existing_rel.weight = max(existing_rel.weight, nr.weight)
            if nr.description and nr.description not in (existing_rel.description or ""):
                existing_rel.description = (existing_rel.description or "") + "; " + nr.description
            if nr.text_unit_ids:
                existing_rel.text_unit_ids = list(set(existing_rel.text_unit_ids or []) | set(nr.text_unit_ids))
        else:
            graph.add_relationship(nr)


async def build_graph_from_chunks(
    chunks: list[dict[str, Any]],
    graph_store: GraphStore,
    generator: Any = None,
    entity_types: list[str] | None = None,
    max_gleanings: int = 2,
    lang: str = "vi",
) -> KnowledgeGraph:
    """Build knowledge graph from paper chunks."""
    if entity_types is None:
        entity_types = [
            "CONCEPT", "METHOD", "DATASET", "METRIC",
            "MODEL", "ALGORITHM", "ARCHITECTURE",
            "TASK", "DOMAIN",
        ]

    graph = graph_store.graph
    total_chunks = len(chunks)

    sem = asyncio.Semaphore(6)

    async def _extract_chunk(chunk: dict[str, Any]) -> None:
        _ensure_not_cancelled()

        chunk_id = chunk.get("id", str(uuid.uuid4()))
        text = chunk.get("text", "")
        paper_id = chunk.get("paper_id", "unknown")
        if not text.strip():
            return

        async with sem:
            _ensure_not_cancelled()
            entities, relationships = await extract_entities_and_relationships(
                text=text,
                source_id=chunk_id,
                entity_types=entity_types,
                generator=generator,
                max_gleanings=max_gleanings,
            )

        _ensure_not_cancelled()
        _deduplicate_entities_into_graph(graph, entities)
        _deduplicate_relationships_into_graph(graph, relationships)

        graph.add_text_unit(GraphTextUnit(
            id=chunk_id,
            text=text[:500],
            entity_ids=[e.id for e in entities],
            relationship_ids=[r.id for r in relationships],
            paper_id=paper_id,
            chunk_index=chunk.get("chunk_index"),
        ))

    batch_size = 8
    processed = 0
    try:
        for i in range(0, total_chunks, batch_size):
            _ensure_not_cancelled()

            batch = chunks[i:i + batch_size]
            n_end = min(i + batch_size, total_chunks)
            _set_progress(
                "extract",
                n_end,
                total_chunks,
                _t("graph.extracting_entities_progress", lang, start=i + 1, end=n_end, total=total_chunks),
                lang=lang,
            )
            logger.info(f"Extracting graph from chunks {i + 1}–{n_end}/{total_chunks}")

            tasks = [asyncio.create_task(_extract_chunk(c)) for c in batch]
            state.build_tasks = tasks
            try:
                results = await asyncio.gather(*tasks, return_exceptions=True)
            finally:
                state.build_tasks = []

            for result in results:
                if isinstance(result, GraphBuildCancelled):
                    raise result
                if isinstance(result, asyncio.CancelledError):
                    raise GraphBuildCancelled("Build cancelled by user")
                if isinstance(result, Exception):
                    logger.warning(f"Chunk extraction failed: {result}")

            processed = n_end
            if state.build_cancelled:
                raise GraphBuildCancelled("Build cancelled by user")

    except GraphBuildCancelled:
        await _cancel_active_tasks()
        logger.warning("Graph build cancelled by user")
        _set_progress("cancelled", processed, total_chunks, _t("graph.cancelled", lang), lang=lang)
        graph_store.save()
        raise

    if not graph.entities:
        logger.warning("No entities extracted from any chunk")
        _set_progress("done", 100, 100, _t("graph.no_entities_found", lang), lang=lang)
        graph_store.save()
        return graph
    _set_progress("cluster", 90, 100, _t("graph.clustering", lang), lang=lang)
    logger.info("Detecting communities...")
    communities = detect_communities(graph.entities, graph.relationships)
    n_communities = len(communities)

    for comm in communities:
        graph.add_community(comm)
        entity_ids = comm.entity_ids or []
        for eid in entity_ids:
            entity = graph.entities.get(eid)
            if entity:
                if entity.community_ids is None:
                    entity.community_ids = []
                if comm.id not in entity.community_ids:
                    entity.community_ids.append(comm.id)

    if generator is not None:
        logger.info("Summarizing communities...")
        for idx, comm in enumerate(graph.communities.values()):
            _ensure_not_cancelled()
            _set_progress(
                "summarize",
                idx + 1,
                n_communities,
                _t("graph.community_summary", lang, current=idx + 1, total=n_communities),
                lang=lang,
            )
            if comm.id not in graph.community_reports:
                report = await summarize_community(comm, graph, generator)
                if report:
                    graph.add_community_report(report)

    _set_progress("done", 100, 100, _t("graph.completed", lang), lang=lang)
    graph_store.save()
    logger.info(f"Graph build complete: {graph.stats()}")
    return graph
