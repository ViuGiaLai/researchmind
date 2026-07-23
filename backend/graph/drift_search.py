"""DRIFT Search — follow-the-lead iterative exploration.

MIT License — adapted from microsoft/graphrag:
https://github.com/microsoft/graphrag
"""

from __future__ import annotations

from typing import Any

from loguru import logger

from academic.governance import get_academic_governance

from .local_search import build_local_context
from .storage import KnowledgeGraph


async def drift_search(
    query: str,
    graph: KnowledgeGraph,
    generator: Any = None,
    max_drift_steps: int = 3,
    entities_per_step: int = 3,
    top_k_entities: int = 5,
    top_k_relationships: int = 5,
) -> str:
    """Execute a DRIFT search — starts local, then iteratively explores new entities."""
    # Step 1: Initial local search
    initial_context = build_local_context(
        query=query,
        graph=graph,
        top_k_entities=top_k_entities,
        top_k_relationships=top_k_relationships,
    )

    if not initial_context.strip():
        return "No relevant graph data found for this query."

    if generator is None:
        return f"DRIFT context (no LLM):\n{initial_context}"

    from .local_search import LOCAL_SEARCH_SYSTEM_PROMPT

    partial_answers: list[str] = []
    explored_entities: set[str] = set()

    # Initial answer
    try:
        response = await generator.generate_direct_async(
            user_prompt=f"Question: {query}\n\nKnowledge Graph Context:\n{initial_context}",
            system_prompt=LOCAL_SEARCH_SYSTEM_PROMPT,
            task_type="research",
        )
        initial_answer = response or ""
        if initial_answer:
            partial_answers.append(f"### Initial Exploration\n{initial_answer}")
    except Exception as e:
        logger.error(f"DRIFT initial search failed: {e}")
        initial_answer = ""

    current_answer = initial_answer

    # Step 2: Iterative drift
    for step in range(max_drift_steps):
        if not current_answer:
            break

        # Extract entities from current answer
        try:
            extract_prompt = get_academic_governance().graph_prompt(
                "drift_extract",
                question=query,
                answer=current_answer[:2000],
            )
            entity_list_resp = await generator.generate_direct_async(
                user_prompt=extract_prompt,
                system_prompt=get_academic_governance().task_contract("entity_listing"),
                task_type="entity",
            )
        except Exception as e:
            logger.error(f"DRIFT entity extraction failed at step {step}: {e}")
            break

        if not entity_list_resp:
            break

        # Parse entity names
        new_entities = [
            name.strip()
            for name in entity_list_resp.strip().split("\n")
            if name.strip() and not name.strip().startswith("#")
        ]

        # Filter to unexplored entities that exist in the graph
        new_entities = [
            name.upper()
            for name in new_entities
            if name.upper() not in explored_entities
            and graph.get_entity_by_title(name) is not None
        ]

        if not new_entities:
            logger.info(f"DRIFT: No new entities to explore at step {step + 1}")
            break

        new_entities = new_entities[:entities_per_step]
        explored_entities.update(new_entities)

        # Build context around new entities
        drift_context_parts: list[str] = []
        for entity_name in new_entities:
            entity = graph.get_entity_by_title(entity_name)
            if not entity:
                continue
            neighbors = graph.get_neighbor_entities(entity.title)
            rels = graph.get_relationships_for_entity(entity.title)

            lines = [f"## Entity: {entity.title} ({entity.type or 'concept'})"]
            if entity.description:
                lines.append(f"Description: {entity.description}")

            if neighbors:
                lines.append("Neighbors:")
                for n in neighbors[:5]:
                    lines.append(f"- {n.title} ({n.type or 'concept'})")

            if rels:
                lines.append("Relationships:")
                for r in rels[:5]:
                    lines.append(f"- {r.source} → {r.target} (w={r.weight:.1f}): {r.description or ''}")

            drift_context_parts.append("\n".join(lines))

        drift_context = "\n\n".join(drift_context_parts)

        # Query LLM about the new entities
        drift_prompt = (
            f"You previously answered: {current_answer[:500]}\n\n"
            f"Now explore these related entities:\n{drift_context}\n\n"
            f"How does this new information expand or refine your answer to: {query}"
        )

        try:
            drift_response = await generator.generate_direct_async(
                user_prompt=drift_prompt,
                system_prompt=get_academic_governance().graph_contract("global"),
                task_type="research",
            )
            if drift_response and drift_response.strip():
                partial_answers.append(f"### Drift Step {step + 1}\n{drift_response.strip()}")
                current_answer = drift_response
        except Exception as e:
            logger.error(f"DRIFT step {step + 1} failed: {e}")
            break

    if len(partial_answers) <= 1:
        return partial_answers[0] if partial_answers else "No answer generated."

    # REDUCE: Synthesize all exploration results
    reduce_prompt = get_academic_governance().graph_prompt(
        "drift_reduce",
        partial_answers="\n\n".join(partial_answers),
        question=query,
    )

    try:
        final_answer = await generator.generate_direct_async(
            user_prompt=reduce_prompt,
            system_prompt=get_academic_governance().graph_contract("global"),
            task_type="synthesis",
        )
        return final_answer or partial_answers[-1]
    except Exception as e:
        logger.error(f"DRIFT reduce failed: {e}")
        return partial_answers[-1]
