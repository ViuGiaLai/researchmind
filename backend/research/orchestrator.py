"""Deep research orchestrator (open_deep_research + STORM inspired).

Executes a multi-step research flow with perspective-guided decomposition:
1. Generate diverse personas/perspectives (STORM-inspired)
2. Each persona asks focused questions from their angle
3. For each question: RAG search + per-question analysis
4. Compress all findings
5. Synthesize final comprehensive answer
"""

from typing import Optional
from loguru import logger

from dataclasses import dataclass
from research.planner import (
    ResearchPlan,
    decompose_query,
    compress_findings,
    synthesize_answer,
)
from research.persona_generator import Persona
from chat.retriever import Retriever
from chat.generator import Generator, GenerationResult


@dataclass
class DeepResearchResult:
    """Result of deep research including plan metadata."""
    content: str
    model_used: str
    finish_reason: str
    plan: ResearchPlan


@logger.catch(reraise=True)
def deep_research(
    query: str,
    retriever: Retriever,
    generator: Generator,
    paper_ids: Optional[list[str]] = None,
    top_k_per_question: int = 3,
) -> DeepResearchResult:
    """Execute deep research on a query.

    Flow:
    1. Decompose query into sub-questions
    2. For each sub-question, retrieve + generate mini-answer
    3. Compress all findings
    4. Synthesize final comprehensive answer

    Returns:
        GenerationResult with the synthesized answer.
    """
    # Step 1: Decompose
    logger.info(f"Deep research: decomposing query: {query}")
    plan = decompose_query(query)
    if not plan.sub_questions:
        plan.sub_questions = [query]

    sub_qs = plan.sub_questions
    logger.info(f"Decomposed into {len(sub_qs)} sub-questions: {sub_qs}")

    # Step 2: Research each sub-question
    findings: list[str] = []
    for i, sub_q in enumerate(sub_qs):
        logger.info(f"Researching sub-question {i+1}/{len(sub_qs)}: {sub_q}")
        try:
            retrieval = retriever.retrieve(sub_q, paper_ids=paper_ids, top_k=top_k_per_question)
            ctx = retrieval.context_text
            if ctx.strip():
                from academic.governance import get_academic_governance
                result = generator.generate_direct(
                    user_prompt=get_academic_governance().sub_question_request(ctx, sub_q),
                    system_prompt=get_academic_governance().task_contract("report_writing"),
                    task_type="research",
                )
                if result:
                    findings.append(f"## {sub_q}\n\n{result}")
            else:
                logger.warning(f"No context found for sub-question: {sub_q}")
                findings.append(f"## {sub_q}\n\n(No information was found in the imported documents.)")
        except Exception as e:
            logger.error(f"Research failed for sub-question '{sub_q}': {e}")
            findings.append(f"## {sub_q}\n\n(Retrieval error: {e})")

    # Step 3: Compress
    logger.info("Compressing research findings...")
    compressed = compress_findings(findings)

    # Step 4: Synthesize
    logger.info("Synthesizing final answer...")
    final_answer = synthesize_answer(query, compressed)

    return DeepResearchResult(
        content=final_answer,
        model_used="deep_research",
        finish_reason="stop",
        plan=plan,
    )
