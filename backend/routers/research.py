"""Deep Research API endpoints.

Adapted from open_deep_research (MIT):
https://github.com/langchain-ai/open_deep_research
"""

import asyncio

from fastapi import APIRouter, Body, HTTPException
from loguru import logger

from app_state import state
from research.orchestrator import DeepResearchResult, deep_research
from research.planner import decompose_query

router = APIRouter(prefix="/api/research", tags=["Research"])


@router.post("/deep")
async def api_deep_research(body: dict = Body(...)):
    """Execute deep research on a query.

    Breaks down complex queries, researches each sub-topic,
    and synthesizes a comprehensive answer.

    Request:
        query (str): The research query.
        paper_ids (list[str], optional): Filter to specific papers.
        top_k (int, optional): Results per sub-question (default 3).

    Response:
        content (str): The synthesized answer.
        sub_questions (list[str]): The sub-questions researched.
        model_used (str): Model info.
    """
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Missing query")

    paper_ids = body.get("paper_ids")
    top_k = body.get("top_k", 3)

    # Check prerequisites
    if not state.hybrid or not state.embedder:
        raise HTTPException(status_code=503, detail="Search engine not initialized. Import papers first.")
    if not state.generator:
        raise HTTPException(status_code=503, detail="Generator not initialized.")

    from chat.retriever import Retriever
    retriever = Retriever(state.hybrid)

    try:
        result: DeepResearchResult = await asyncio.to_thread(
            deep_research,
            query=query,
            retriever=retriever,
            generator=state.generator,
            paper_ids=paper_ids,
            top_k_per_question=top_k,
        )

        return {
            "content": result.content,
            "sub_questions": result.plan.sub_questions,
            "brief": result.plan.brief,
            "personas": [
                {"name": p.name, "description": p.description, "focus_areas": p.focus_areas}
                for p in result.plan.personas
            ],
            "model_used": result.model_used,
            "finish_reason": result.finish_reason,
        }
    except Exception as e:
        logger.error(f"Deep research failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/decompose")
async def api_decompose_query(body: dict = Body(...)):
    """Decompose a query into sub-questions without executing research.

    Useful for previewing the research plan before running.

    Request:
        query (str): The query to decompose.

    Response:
        sub_questions (list[str]): The sub-questions.
        brief (str): Research brief description.
    """
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Missing query")

    plan = decompose_query(query)
    return {
        "sub_questions": plan.sub_questions,
        "brief": plan.brief,
    }


@router.post("/pipeline")
async def api_run_pipeline(body: dict = Body(...)):
    """
    Execute the full academic governance pipeline.

    Orchestrates: parse → retrieve → analyze → audit → verify →
    auto_fix → synthesize → review → export.

    All step logic is data-driven from academic_governance.json.
    Each step runs a dedicated agent — NOT an LLM prompt.

    Request:
        query (str): The research query / topic.
        paper_ids (list[str], optional): Papers to analyze.
        venue_id (str, optional): Target venue (default "ieee_trans").
        language (str, optional): Output language (default "vi").

    Response:
        Pipeline execution result with step-by-step details.
    """
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Missing query")

    paper_ids = body.get("paper_ids")
    venue_id = body.get("venue_id", "ieee_trans")
    language = body.get("language", "vi")

    try:
        from agents.orchestrator import run_pipeline

        result = await run_pipeline(
            query=query,
            paper_ids=paper_ids,
            venue_id=venue_id,
            language=language,
        )

        return {
            "trace_id": result.trace_id,
            "success": result.success,
            "venue_id": result.venue_id,
            "governance_version": result.governance_version,
            "steps": [
                {
                    "step": s.step,
                    "agent": s.agent_name,
                    "success": s.success,
                    "output_preview": str(s.output)[:200] if s.output else None,
                    "errors": s.errors[:3],
                }
                for s in result.steps
            ],
            "final_output_preview": str(result.final_output)[:500] if result.final_output else None,
            "evaluation": {
                "overall_quality": result.evaluation.overall_quality if result.evaluation else None,
                "citation_accuracy": result.evaluation.citation_accuracy if result.evaluation else None,
                "factual_consistency": result.evaluation.factual_consistency if result.evaluation else None,
            } if result.evaluation else None,
        }
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
