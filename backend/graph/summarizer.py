"""LLM-generated community reports — summarization of entity clusters.

MIT License — adapted from microsoft/graphrag:
https://github.com/microsoft/graphrag
"""

from __future__ import annotations
import uuid
from typing import Any

from loguru import logger

from .models import GraphCommunity, GraphCommunityReport, GraphEntity, GraphRelationship
from .storage import KnowledgeGraph
from .errors import GraphBuildCancelled
from academic.governance import get_academic_governance



async def summarize_community(
    community: GraphCommunity,
    graph: KnowledgeGraph,
    generator: Any = None,
) -> GraphCommunityReport | None:
    """Generate an LLM summary for a single community."""
    if generator is None:
        return None

    entity_ids = community.entity_ids or []
    entities = [graph.entities.get(eid) for eid in entity_ids if eid in graph.entities]
    entities = [e for e in entities if e is not None]

    if not entities:
        return None

    entity_titles = {e.title.upper() for e in entities}
    relationships = [
        r for r in graph.relationships.values()
        if r.source.upper() in entity_titles and r.target.upper() in entity_titles
    ]

    entity_lines = "\n".join(
        f"- {e.title} ({e.type or 'N/A'}): {e.description or 'No description'}"
        for e in entities
    )
    rel_lines = "\n".join(
        f"- {r.source} → {r.target} ({r.weight:.1f}): {r.description or ''}"
        for r in relationships
    )

    prompt = get_academic_governance().graph_prompt(
        "community_report",
        entity_descriptions=entity_lines or "(no entities)",
        relationship_descriptions=rel_lines or "(no relationships)",
    )

    try:
        from app_state import state
        if state.build_cancelled:
            raise GraphBuildCancelled("Build cancelled by user")
        response = await generator.generate_direct_async(
            user_prompt=prompt,
            system_prompt=get_academic_governance().graph_contract("community"),
            task_type="summary",
        )
    except GraphBuildCancelled:
        raise
    except Exception as e:
        logger.error(f"Community summarization failed for {community.id}: {e}")
        return None

    if not response:
        return None

    content = response.strip()
    # Extract summary from first paragraph (before **Key Themes**)
    summary = content.split("**Key Themes**")[0].strip().lstrip("**Summary**").strip()
    if not summary:
        summary = content[:300]

    report = GraphCommunityReport(
        id=str(uuid.uuid4()),
        community_id=community.id,
        summary=summary[:500],
        full_content=content,
        rank=community.size,
        size=community.size,
    )

    logger.info(f"Generated community report for {community.title} ({len(content)} chars)")
    return report
