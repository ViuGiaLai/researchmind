"""Local Search — entity-centric graph query with embedding + keyword scoring.

MIT License — adapted from microsoft/graphrag:
https://github.com/microsoft/graphrag
"""

from __future__ import annotations
from typing import Any, Callable

from loguru import logger

from .models import GraphEntity, GraphRelationship
from .storage import KnowledgeGraph
from academic.governance import get_academic_governance

LOCAL_SEARCH_SYSTEM_PROMPT = get_academic_governance().graph_contract("local")


def _score_entities_keyword(
    query: str,
    entities: dict[str, GraphEntity],
    top_k: int,
) -> list[tuple[GraphEntity, float]]:
    """Score entities by keyword overlap with query."""
    query_lower = query.lower()
    query_words = set(query_lower.split())

    scored: list[tuple[GraphEntity, float]] = []
    for entity in entities.values():
        score = 0.0
        title_lower = entity.title.lower()
        desc_lower = (entity.description or "").lower()
        type_lower = (entity.type or "").lower()

        if query_lower in title_lower:
            score += 10.0
        title_words = set(title_lower.split())
        word_overlap = len(query_words & title_words)
        score += word_overlap * 3.0
        if query_lower in desc_lower:
            score += 5.0
        if query_lower in type_lower:
            score += 2.0
        score *= (entity.rank or 1.0)

        if score > 0:
            scored.append((entity, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def _score_entities_embedding(
    query: str,
    entities: dict[str, GraphEntity],
    embedder: Callable[[str], list[float]],
    top_k: int,
) -> list[tuple[GraphEntity, float]]:
    """Score entities by cosine similarity of query embedding vs entity description embedding."""
    if not entities:
        return []

    import numpy as np

    query_emb = np.array(embedder(query), dtype=np.float32)
    query_norm = np.linalg.norm(query_emb)
    if query_norm > 0:
        query_emb = query_emb / query_norm

    scored: list[tuple[GraphEntity, float]] = []
    for entity in entities.values():
        if not entity.description_embedding:
            continue
        ent_emb = np.array(entity.description_embedding, dtype=np.float32)
        ent_norm = np.linalg.norm(ent_emb)
        if ent_norm == 0:
            continue
        similarity = float(np.dot(query_emb, ent_emb / ent_norm))
        similarity = max(0.0, min(1.0, similarity)) * (entity.rank or 1.0)
        scored.append((entity, similarity))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def _hybrid_entity_score(
    query: str,
    graph: KnowledgeGraph,
    top_k: int,
    embedder: Callable[[str], list[float]] | None = None,
    keyword_weight: float = 0.3,
    embedding_weight: float = 0.7,
) -> list[tuple[GraphEntity, float]]:
    """Combine keyword and embedding scores for entity ranking.

    When embedder is available, embedding_weight controls the mix.
    When no embedder, falls back to pure keyword scoring.
    """
    if embedder is None or not graph.entities:
        return _score_entities_keyword(query, graph.entities, top_k)

    kw_scored = dict(_score_entities_keyword(query, graph.entities, top_k * 2))
    emb_scored = dict(_score_entities_embedding(query, graph.entities, embedder, top_k * 2))

    all_titles = set(kw_scored.keys()) | set(emb_scored.keys())
    if not all_titles:
        return []

    # Normalize scores to [0, 1] within each method
    def _normalize(scores: dict[GraphEntity, float]) -> dict[GraphEntity, float]:
        if not scores:
            return scores
        max_val = max(scores.values())
        return {e: s / max_val for e, s in scores.items()} if max_val > 0 else scores

    kw_norm = _normalize(kw_scored)
    emb_norm = _normalize(emb_scored)

    combined: list[tuple[GraphEntity, float]] = []
    for entity_key in all_titles:
        kw_score = kw_norm.get(entity_key, 0.0)
        emb_score = emb_norm.get(entity_key, 0.0)
        combined.append((entity_key, keyword_weight * kw_score + embedding_weight * emb_score))

    combined.sort(key=lambda x: x[1], reverse=True)
    return combined[:top_k]


def build_local_context(
    query: str,
    graph: KnowledgeGraph,
    top_k_entities: int = 10,
    top_k_relationships: int = 10,
    include_community_reports: bool = True,
    max_context_tokens: int = 4000,
    embedder: Callable[[str], list[float]] | None = None,
    keyword_weight: float = 0.3,
    embedding_weight: float = 0.7,
) -> str:
    """Build context for local search from the knowledge graph.

    Strategy:
    1. Find entities matching query (hybrid keyword + embedding scoring)
    2. Expand to neighbor entities via relationships
    3. Include community reports for matched entities
    4. Include original text units
    """
    top_entities = _hybrid_entity_score(
        query, graph, top_k_entities,
        embedder=embedder,
        keyword_weight=keyword_weight,
        embedding_weight=embedding_weight,
    )

    if not top_entities:
        return ""

    # Collect neighbor entities
    neighbor_entities: list[GraphEntity] = []
    seen_neighbors: set[str] = set()
    for entity, _ in top_entities:
        neighbors = graph.get_neighbor_entities(entity.title)
        for n in neighbors:
            if n.title.upper() not in seen_neighbors:
                seen_neighbors.add(n.title.upper())
                neighbor_entities.append(n)

    # Collect relationships for top entities
    entity_titles = {e.title.upper() for e, _ in top_entities}
    matched_relationships = [
        r for r in graph.relationships.values()
        if r.source.upper() in entity_titles or r.target.upper() in entity_titles
    ]
    matched_relationships.sort(key=lambda r: r.weight, reverse=True)
    matched_relationships = matched_relationships[:top_k_relationships]

    # Collect text units
    text_unit_ids: set[str] = set()
    for entity, _ in top_entities:
        if entity.text_unit_ids:
            text_unit_ids.update(entity.text_unit_ids)
    matched_text_units = [
        tu for tu in graph.text_units.values()
        if tu.id in text_unit_ids
    ]

    # Collect community reports
    community_reports_text = ""
    if include_community_reports:
        entity_community_ids: set[str] = set()
        for entity, _ in top_entities:
            if entity.community_ids:
                entity_community_ids.update(entity.community_ids)
        reports = [
            cr for cid, cr in graph.community_reports.items()
            if cid in entity_community_ids
        ]
        if reports:
            report_lines = []
            for r in reports:
                report_lines.append(f"[Community: {r.community_id}]")
                report_lines.append(f"Summary: {r.summary}")
                report_lines.append("")
            community_reports_text = "\n".join(report_lines)

    # Build context string
    parts: list[str] = []

    if top_entities:
        entity_lines = ["### Related Entities"]
        for entity, score_val in top_entities:
            entity_lines.append(
                f"- {entity.title} ({entity.type or 'concept'}, score={score_val:.3f}): "
                f"{entity.description or ''}"
            )
        parts.append("\n".join(entity_lines))

    if neighbor_entities:
        neighbor_lines = ["### Neighbor Entities"]
        for n in neighbor_entities[:10]:
            neighbor_lines.append(f"- {n.title} ({n.type or 'concept'}): {n.description or ''}")
        parts.append("\n".join(neighbor_lines))

    if matched_relationships:
        rel_lines = ["### Relationships"]
        for r in matched_relationships:
            rel_lines.append(f"- {r.source} → {r.target} (weight={r.weight:.1f}): {r.description or ''}")
        parts.append("\n".join(rel_lines))

    if community_reports_text:
        parts.append(f"### Community Reports\n{community_reports_text}")

    if matched_text_units:
        tu_lines = ["### Source Text"]
        for tu in matched_text_units[:5]:
            tu_lines.append(f"[Paper: {tu.paper_id or 'unknown'}] {tu.text[:300]}...")
        parts.append("\n".join(tu_lines))

    context = "\n\n".join(parts)
    max_chars = max_context_tokens * 4
    if len(context) > max_chars:
        context = context[:max_chars] + "\n\n[context truncated]"

    return context


async def local_search(
    query: str,
    graph: KnowledgeGraph,
    generator: Any = None,
    top_k_entities: int = 10,
    top_k_relationships: int = 10,
    embedder: Callable[[str], list[float]] | None = None,
) -> str:
    """Execute a local search query against the knowledge graph."""
    context = build_local_context(
        query=query,
        graph=graph,
        top_k_entities=top_k_entities,
        top_k_relationships=top_k_relationships,
        embedder=embedder,
    )

    if not context.strip():
        return "No relevant graph data found for this query."

    if generator is None:
        return f"Context (no LLM):\n{context}"

    try:
        response = await generator.generate_direct_async(
            user_prompt=f"Question: {query}\n\nKnowledge Graph Context:\n{context}",
            system_prompt=LOCAL_SEARCH_SYSTEM_PROMPT,
            task_type="research",
        )
        return response or "No response generated."
    except Exception as e:
        logger.error(f"Local search generation failed: {e}")
        return f"Local search error: {e}"
