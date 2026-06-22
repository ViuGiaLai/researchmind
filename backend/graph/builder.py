"""Knowledge graph builder — orchestrates extraction, clustering, and summarization.

MIT License — adapted from microsoft/graphrag.
"""

from __future__ import annotations
import asyncio
import uuid
from typing import Any

from loguru import logger

from .models import (
    GraphEntity,
    GraphRelationship,
    GraphTextUnit,
)
from .storage import KnowledgeGraph, GraphStore
from .extractor import extract_entities_and_relationships
from .cluster import detect_communities
from .summarizer import summarize_community


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
        # Check if reverse exists
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
) -> KnowledgeGraph:
    """Build knowledge graph from paper chunks.

    Args:
        chunks: List of dicts with 'id', 'text', 'paper_id', 'chunk_index' keys.
        graph_store: GraphStore instance to populate.
        generator: Generator instance for LLM calls.
        entity_types: Entity types to extract (default academic types).
        max_gleanings: Number of gleaning rounds per chunk.

    Returns:
        Populated KnowledgeGraph.
    """
    if entity_types is None:
        entity_types = [
            "CONCEPT", "METHOD", "DATASET", "METRIC",
            "MODEL", "ALGORITHM", "ARCHITECTURE",
            "TASK", "DOMAIN",
        ]

    graph = graph_store.graph
    total_chunks = len(chunks)

    # Phase 1: Extract entities and relationships from each chunk (parallel with semaphore)
    sem = asyncio.Semaphore(4)  # Limit concurrent LLM calls

    async def _extract_chunk(chunk: dict[str, Any]) -> None:
        chunk_id = chunk.get("id", str(uuid.uuid4()))
        text = chunk.get("text", "")
        paper_id = chunk.get("paper_id", "unknown")
        if not text.strip():
            return

        async with sem:
            entities, relationships = await extract_entities_and_relationships(
                text=text,
                source_id=chunk_id,
                entity_types=entity_types,
                generator=generator,
                max_gleanings=max_gleanings,
            )

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

    # Process chunks in parallel batches
    batch_size = 8
    for i in range(0, total_chunks, batch_size):
        batch = chunks[i:i + batch_size]
        logger.info(f"Extracting graph from chunks {i + 1}–{min(i + batch_size, total_chunks)}/{total_chunks}")
        await asyncio.gather(*[_extract_chunk(c) for c in batch])

    if not graph.entities:
        logger.warning("No entities extracted from any chunk")
        graph_store.save()
        return graph

    # Phase 2: Detect communities
    logger.info("Detecting communities...")
    communities = detect_communities(graph.entities, graph.relationships)

    for comm in communities:
        graph.add_community(comm)
        # Assign community IDs to entities
        entity_ids = comm.entity_ids or []
        for eid in entity_ids:
            entity = graph.entities.get(eid)
            if entity:
                if entity.community_ids is None:
                    entity.community_ids = []
                if comm.id not in entity.community_ids:
                    entity.community_ids.append(comm.id)

    # Phase 3: Summarize communities
    if generator is not None:
        logger.info("Summarizing communities...")
        for comm in graph.communities.values():
            if comm.id not in graph.community_reports:
                report = await summarize_community(comm, graph, generator)
                if report:
                    graph.add_community_report(report)

    graph_store.save()
    logger.info(f"Graph build complete: {graph.stats()}")
    return graph
