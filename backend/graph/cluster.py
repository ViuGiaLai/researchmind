"""Community detection via hierarchical Leiden clustering.

MIT License — adapted from microsoft/graphrag:
https://github.com/microsoft/graphrag/blob/main/packages/graphrag/graphrag/index/operations/cluster_graph.py
"""

from __future__ import annotations
import uuid
from collections import defaultdict
from typing import Any

import networkx as nx
from loguru import logger

from .models import GraphCommunity, GraphEntity, GraphRelationship


def detect_communities(
    entities: dict[str, GraphEntity],
    relationships: dict[str, GraphRelationship],
    max_cluster_size: int = 10,
    seed: int | None = 42,
) -> list[GraphCommunity]:
    """Detect communities using NetworkX's Leiden algorithm (via community-louvain)."""
    if not entities or not relationships:
        logger.warning("No entities or relationships to cluster")
        return []

    G = nx.Graph()

    for entity in entities.values():
        G.add_node(entity.title, id=entity.id)

    for rel in relationships.values():
        G.add_edge(rel.source, rel.target, weight=rel.weight)

    # Try leiden algorithm, fall back to louvain
    communities = _try_leiden(G, entities, relationships, max_cluster_size, seed)
    if communities is not None:
        return communities

    logger.warning("Leiden unavailable — falling back to Louvain")
    return _fallback_louvain(G, entities, relationships)


def _try_leiden(
    G: nx.Graph,
    entities: dict[str, GraphEntity],
    relationships: dict[str, GraphRelationship],
    max_cluster_size: int,
    seed: int | None,
) -> list[GraphCommunity] | None:
    """Try graspologic Leiden, handling API differences across versions."""
    try:
        from graspologic.partition import hierarchical_leiden
        result = hierarchical_leiden(
            G,
            max_cluster_size=max_cluster_size,
            random_seed=seed,
        )
        return _build_communities_from_leiden(result, entities, relationships)
    except (ImportError, AttributeError, TypeError, Exception) as e:
        logger.debug(f"graspologic Leiden failed ({e}), trying graspologic.partition.leiden...")
    try:
        from graspologic.partition import leiden
        result = leiden(G, random_seed=seed)
        return _build_communities_flat(result, entities)
    except (ImportError, AttributeError, TypeError, Exception) as e:
        logger.debug(f"graspologic leiden failed ({e})")
    return None


def _build_communities_from_leiden(
    leiden_result: list[Any],
    entities: dict[str, GraphEntity],
    relationships: dict[str, GraphRelationship],
) -> list[GraphCommunity]:
    """Convert leiden output to GraphCommunity list."""
    clusters: dict[int, dict[int, list[str]]] = defaultdict(lambda: defaultdict(list))
    hierarchy: dict[int, int] = {}

    for partition in leiden_result:
        clusters[partition.level][partition.cluster].append(partition.node)
        if partition.parent_cluster is not None:
            hierarchy[partition.cluster] = partition.parent_cluster

    communities: list[GraphCommunity] = []
    entity_title_to_id = {e.title.upper(): e.id for e in entities.values()}

    for level in sorted(clusters.keys()):
        for cluster_id, node_names in clusters[level].items():
            entity_ids = [
                entity_title_to_id.get(n.upper())
                for n in node_names
                if entity_title_to_id.get(n.upper())
            ]
            parent_id = hierarchy.get(cluster_id)

            comm = GraphCommunity(
                id=str(uuid.uuid4()),
                title=f"L{level}_C{cluster_id}",
                level=level,
                parent=str(parent_id) if parent_id is not None else None,
                entity_ids=entity_ids,
                size=len(node_names),
            )
            communities.append(comm)

    logger.info(f"Detected {len(communities)} communities across {len(set(c.level for c in communities))} levels")
    return communities


def _build_communities_flat(
    partition: dict[str, int],
    entities: dict[str, GraphEntity],
) -> list[GraphCommunity]:
    """Convert flat partition dict to GraphCommunity list."""
    entity_title_to_id = {e.title.upper(): e.id for e in entities.values()}
    cluster_groups: dict[int, list[str]] = defaultdict(list)
    for node, cluster_id in partition.items():
        cluster_groups[cluster_id].append(node)

    communities: list[GraphCommunity] = []
    for cluster_id, node_names in cluster_groups.items():
        entity_ids = [
            entity_title_to_id.get(n.upper())
            for n in node_names
            if entity_title_to_id.get(n.upper())
        ]
        communities.append(GraphCommunity(
            id=str(uuid.uuid4()),
            title=f"C{cluster_id}",
            level=0,
            entity_ids=entity_ids,
            size=len(node_names),
        ))
    return communities


def _fallback_louvain(
    G: nx.Graph,
    entities: dict[str, GraphEntity],
    relationships: dict[str, GraphRelationship],
) -> list[GraphCommunity]:
    """Fallback using Louvain from community package."""
    try:
        import community as community_louvain
        partition = community_louvain.best_partition(G, random_state=42)
    except ImportError:
        logger.error("Neither graspologic nor community-louvain available — returning flat communities")
        return _flat_communities(G, entities)

    entity_title_to_id = {e.title.upper(): e.id for e in entities.values()}

    # Group by cluster id
    cluster_groups: dict[int, list[str]] = defaultdict(list)
    for node, cluster_id in partition.items():
        cluster_groups[cluster_id].append(node)

    communities: list[GraphCommunity] = []
    for cluster_id, node_names in cluster_groups.items():
        entity_ids = [
            entity_title_to_id.get(n.upper())
            for n in node_names
            if entity_title_to_id.get(n.upper())
        ]
        comm = GraphCommunity(
            id=str(uuid.uuid4()),
            title=f"C{cluster_id}",
            level=0,
            entity_ids=entity_ids,
            size=len(node_names),
        )
        communities.append(comm)

    logger.info(f"Detected {len(communities)} flat communities via Louvain")
    return communities


def _flat_communities(
    G: nx.Graph,
    entities: dict[str, GraphEntity],
) -> list[GraphCommunity]:
    """Last resort: one community containing all entities."""
    entity_title_to_id = {e.title.upper(): e.id for e in entities.values()}
    return [
        GraphCommunity(
            id=str(uuid.uuid4()),
            title="ALL",
            level=0,
            entity_ids=list(entity_title_to_id.values()),
            size=len(entity_title_to_id),
        )
    ]
