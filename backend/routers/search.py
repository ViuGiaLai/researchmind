import asyncio
from fastapi import APIRouter, Body, HTTPException, Query
from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import Paper

router = APIRouter(prefix="/api/search", tags=["Search"])


@router.post("")
async def search(query: dict = Body(...)):
    """Hybrid search across all indexed PDFs with support for tag: or thẻ: filters."""
    import re
    import json
    
    text = query.get("text", "")
    paper_ids = query.get("paper_ids") or []
    top_k = query.get("top_k", 10)

    if not text.strip():
        raise HTTPException(status_code=400, detail="Query text is required")

    # Match tag:(word) or tag:"quoted string" (also thẻ: and the:)
    tag_pattern = r'(?:tag|thẻ|the):(?:([^"\s]+)|"([^"]+)")'
    matches = re.findall(tag_pattern, text, re.IGNORECASE)
    tags_to_filter = []
    for m in matches:
        val = m[0] or m[1]
        if val:
            tags_to_filter.append(val.strip().lower())

    # Remove tags from the query text to perform semantic search on clean text
    clean_text = re.sub(tag_pattern, "", text).strip()
    
    # If clean_text is empty but we have tags, search for the tags as keywords
    if not clean_text and tags_to_filter:
        clean_text = " ".join(tags_to_filter)

    # Filter papers by tags in database
    if tags_to_filter:
        session = get_session(state.engine)
        try:
            papers = session.query(Paper).filter(Paper.status == "indexed").all()
            tagged_paper_ids = []
            for p in papers:
                if p.tags:
                    try:
                        p_tags = [t.lower() for t in json.loads(p.tags)]
                        if all(t in p_tags for t in tags_to_filter):
                            tagged_paper_ids.append(p.id)
                    except Exception:
                        pass
            
            if not tagged_paper_ids:
                return {
                    "query": text,
                    "total": 0,
                    "results": []
                }
            
            if paper_ids:
                # Intersect with user-selected paper IDs
                paper_ids = list(set(paper_ids).intersection(tagged_paper_ids))
                if not paper_ids:
                    return {
                        "query": text,
                        "total": 0,
                        "results": []
                    }
            else:
                paper_ids = tagged_paper_ids
        except Exception as e:
            logger.error(f"Error filtering papers by tag: {e}")
        finally:
            session.close()

    # If the clean query is still empty, throw an error
    if not clean_text.strip():
        raise HTTPException(status_code=400, detail="Query text (or tag search target) is empty")

    results = await asyncio.to_thread(
        state.hybrid.search,
        query=clean_text,
        paper_ids=paper_ids if paper_ids else None,
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
    """Get search suggestions including tags and matching papers."""
    session = get_session(state.engine)
    try:
        q_lower = q.strip().lower()
        if not q_lower:
            return {"suggestions": [], "tags": [], "papers": []}

        # Query all indexed papers
        papers = session.query(Paper).filter(Paper.status == "indexed").all()
        
        matched_tags = set()
        matched_papers = []
        
        import json
        for p in papers:
            title = p.title or p.filename
            if q_lower in title.lower():
                matched_papers.append({
                    "id": p.id,
                    "title": title
                })
            if p.tags:
                try:
                    tags_list = json.loads(p.tags)
                    for t in tags_list:
                        if q_lower in t.lower():
                            matched_tags.add(t)
                except Exception:
                    pass

        tags_res = sorted(list(matched_tags))[:limit]
        papers_res = matched_papers[:limit]
        
        suggestions = []
        for tag in tags_res:
            suggestions.append(f"Thẻ: {tag}")
        for p in papers_res:
            suggestions.append(p["title"])

        return {
            "tags": tags_res,
            "papers": papers_res,
            "suggestions": suggestions[:limit * 2]
        }
    finally:
        session.close()
