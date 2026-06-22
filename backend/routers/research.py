"""Deep Research API endpoints.

Adapted from open_deep_research (MIT):
https://github.com/langchain-ai/open_deep_research
"""

from fastapi import APIRouter, Body, HTTPException
from loguru import logger

from app_state import state
from config.settings import settings
from research.orchestrator import deep_research, DeepResearchResult
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
        result: DeepResearchResult = deep_research(
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
