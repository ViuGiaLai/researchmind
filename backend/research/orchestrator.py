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
from common.i18n import get_output_language_name, t as _t

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
    lang: str = "vi",
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
    plan = decompose_query(query, lang=lang)
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
                result = generator.generate_direct(
                    user_prompt=f"""Dựa trên context sau, hãy trả lời câu hỏi phụ này.

Context:
{ctx}

Câu hỏi phụ: {sub_q}

Trả lời chi tiết, chỉ dựa trên context, trích dẫn [Tên Paper] cho mỗi thông tin.
Trả lời bằng {get_output_language_name(lang)}.""",
                    system_prompt="Bạn là trợ lý nghiên cứu. Trả lời dựa trên context được cung cấp.",
                    task_type="research",
                )
                if result:
                    findings.append(f"## {sub_q}\n\n{result}")
            else:
                logger.warning(f"No context found for sub-question: {sub_q}")
                findings.append(f"## {sub_q}\n\n{_t('research.no_info_found', lang)}")
        except Exception as e:
            logger.error(f"Research failed for sub-question '{sub_q}': {e}")
            findings.append(f"## {sub_q}\n\n{_t('research.lookup_error', lang, error=str(e))}")

    # Step 3: Compress
    logger.info("Compressing research findings...")
    compressed = compress_findings(findings, lang=lang)

    # Step 4: Synthesize
    logger.info("Synthesizing final answer...")
    final_answer = synthesize_answer(query, compressed, lang=lang)

    return DeepResearchResult(
        content=final_answer,
        model_used="deep_research",
        finish_reason="stop",
        plan=plan,
    )
