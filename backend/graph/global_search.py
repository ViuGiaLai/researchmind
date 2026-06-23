"""Global Search — map-reduce over community reports.

MIT License — adapted from microsoft/graphrag:
https://github.com/microsoft/graphrag
"""

from __future__ import annotations
from typing import Any

from loguru import logger

from .models import GraphCommunityReport, GraphCommunity
from .storage import KnowledgeGraph

GLOBAL_MAP_PROMPT = """You are a research analyst. You are analyzing a community of entities from academic papers.

Community Summary: {community_summary}

Given this community information, answer the following question. Focus only on what this specific community reveals.

Question: {question}

Partial Answer (based on this community only):"""

GLOBAL_REDUCE_PROMPT = """You are a senior research synthesizer. You have received partial answers from multiple communities of entities.

{partial_answers}

Synthesize these into a comprehensive final answer covering:
1. **Main Findings** — The key insights across all communities
2. **Connections** — How the different communities relate to each other
3. **Conclusion** — A unified answer to the original question

Original Question: {question}

Final Comprehensive Answer:"""


async def global_search(
    query: str,
    graph: KnowledgeGraph,
    generator: Any = None,
    max_reports: int = 15,
) -> str:
    """Execute a global search via map-reduce over community reports."""
    reports = list(graph.community_reports.values())
    if not reports:
        # Fall back to community-level summaries
        reports = [
            GraphCommunityReport(
                id=c.id,
                community_id=c.id,
                summary=f"Community {c.title} with {c.size} entities",
                full_content="",
            )
            for c in graph.communities.values()
        ]

    if not reports:
        return "No community data available for global search."

    # Sort by rank and limit
    reports.sort(key=lambda r: r.rank or 0, reverse=True)
    reports = reports[:max_reports]

    if generator is None:
        summaries = "\n".join(
            f"- Community {r.community_id}: {r.summary or '(no summary)'}"
            for r in reports
        )
        return f"Global context (no LLM):\n{summaries}"

    # MAP: Generate partial answers per community
    partial_answers: list[str] = []
    for i, report in enumerate(reports):
        community_text = report.full_content or report.summary
        if not community_text:
            continue

        prompt = GLOBAL_MAP_PROMPT.format(
            community_summary=community_text,
            question=query,
        )

        try:
            response = await generator.generate_direct_async(
                user_prompt=prompt,
                system_prompt="You are a research analyst providing community-level analysis.",
                task_type="research",
            )
            if response and response.strip():
                partial_answers.append(
                    f"### Community {i+1}: {report.community_id}\n{response.strip()}"
                )
        except Exception as e:
            logger.error(f"Global search map failed for community {report.community_id}: {e}")

    if not partial_answers:
        return "No partial answers could be generated from communities."

    # REDUCE: Synthesize all partial answers
    reduce_prompt = GLOBAL_REDUCE_PROMPT.format(
        partial_answers="\n\n".join(partial_answers),
        question=query,
    )

    try:
        final_answer = await generator.generate_direct_async(
            user_prompt=reduce_prompt,
            system_prompt="You are a senior research synthesizer.",
            task_type="synthesis",
        )
        return final_answer or "No synthesis could be generated."
    except Exception as e:
        logger.error(f"Global search reduce failed: {e}")
        return "\n\n".join(partial_answers)
