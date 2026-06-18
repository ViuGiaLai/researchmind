import asyncio
from fastapi import APIRouter, Body, HTTPException, Query
from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import Paper

router = APIRouter(prefix="/api/search", tags=["Search"])


@router.post("")
async def search(query: dict = Body(...)):
    """Hybrid search across all indexed PDFs."""
    text = query.get("text", "")
    paper_ids = query.get("paper_ids")
    top_k = query.get("top_k", 10)

    if not text.strip():
        raise HTTPException(status_code=400, detail="Query text is required")

    results = await asyncio.to_thread(
        state.hybrid.search,
        query=text,
        paper_ids=paper_ids,
        top_k=top_k,
        use_reranker=True,
    )

    return {
        "query": text,
        "total": len(results),
        "results": [
            {
                "chunk_id": r.chunk_id,
                "paper_id": r.paper_id,
                "paper_title": r.paper_title,
                "content": r.content,
                "page_number": r.page_number,
                "score": round(r.score, 4),
            }
            for r in results
        ],
    }


@router.get("/suggest")
async def search_suggest(q: str = Query(...), limit: int = Query(5)):
    """Get search suggestions."""
    session = get_session(state.engine)
    try:
        papers = session.query(Paper).filter(
            Paper.status == "indexed",
            Paper.title.ilike(f"%{q}%"),
        ).limit(limit).all()

        return {
            "suggestions": [p.title or p.filename for p in papers],
        }
    finally:
        session.close()
