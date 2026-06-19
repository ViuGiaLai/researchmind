import asyncio
from fastapi import APIRouter, Body, HTTPException, Query
from loguru import logger
from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import CollectionPaper, Paper

router = APIRouter(prefix="/api/search", tags=["Search"])


@router.post("")
async def search(query: dict = Body(...)):
    """Hybrid search across all indexed PDFs with support for tag: or tháº»: filters."""
    import re
    import json
    
    text = query.get("text", "")
    paper_ids = query.get("paper_ids") or []
    top_k = query.get("top_k", 10)
    filters = query.get("filters") or {}
    collection_id = query.get("collection_id") or filters.get("collection_id")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Query text is required")

    # Match tag:(word) or tag:"quoted string" (also tháº»: and the:)
    tag_pattern = r'(?:tag|tháº»|the):(?:([^"\s]+)|"([^"]+)")'
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

    structured_tags = filters.get("tags") or []
    if isinstance(structured_tags, str):
        structured_tags = [structured_tags]
    tags_to_filter.extend([t.strip().lower() for t in structured_tags if str(t).strip()])

    author_filter = (filters.get("author") or "").strip().lower()
    year_from = filters.get("year_from")
    year_to = filters.get("year_to")
    read_status = filters.get("read_status")
    starred = filters.get("starred")
    sort_by = filters.get("sort_by") or "relevance"
    sort_order = filters.get("sort_order") or "desc"

    # Filter papers by metadata in database before retrieval.
    if tags_to_filter or author_filter or year_from or year_to or read_status or starred is not None or collection_id:
        session = get_session(state.engine)
        try:
            papers_query = session.query(Paper).filter(Paper.status == "indexed")
            if collection_id:
                collection_paper_ids = [
                    row.paper_id
                    for row in session.query(CollectionPaper.paper_id)
                    .filter(CollectionPaper.collection_id == collection_id)
                    .all()
                ]
                if not collection_paper_ids:
                    return {"query": text, "total": 0, "results": []}
                papers_query = papers_query.filter(Paper.id.in_(collection_paper_ids))
            if author_filter:
                papers_query = papers_query.filter(Paper.authors.ilike(f"%{author_filter}%"))
            if year_from:
                papers_query = papers_query.filter(Paper.year >= int(year_from))
            if year_to:
                papers_query = papers_query.filter(Paper.year <= int(year_to))
            if read_status:
                papers_query = papers_query.filter(Paper.read_status == read_status)
            if starred is not None:
                papers_query = papers_query.filter(Paper.starred == (1 if bool(starred) else 0))

            papers = papers_query.all()
            filtered_paper_ids = []
            for p in papers:
                if tags_to_filter and p.tags:
                    try:
                        p_tags = [t.lower() for t in json.loads(p.tags)]
                        if all(t in p_tags for t in tags_to_filter):
                            filtered_paper_ids.append(p.id)
                    except Exception:
                        pass
                elif not tags_to_filter:
                    filtered_paper_ids.append(p.id)
            
            if not filtered_paper_ids:
                return {
                    "query": text,
                    "total": 0,
                    "results": []
                }
            
            if paper_ids:
                # Intersect with user-selected paper IDs
                paper_ids = list(set(paper_ids).intersection(filtered_paper_ids))
                if not paper_ids:
                    return {
                        "query": text,
                        "total": 0,
                        "results": []
                    }
            else:
                paper_ids = filtered_paper_ids
        except Exception as e:
            logger.error(f"Error filtering papers for search: {e}")
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

    if sort_by in {"year", "title", "created_at"} and results:
        session = get_session(state.engine)
        try:
            paper_map = {p.id: p for p in session.query(Paper).filter(Paper.id.in_([r.paper_id for r in results])).all()}
            reverse = sort_order != "asc"
            if sort_by == "year":
                results.sort(key=lambda r: paper_map.get(r.paper_id).year if paper_map.get(r.paper_id) else 0, reverse=reverse)
            elif sort_by == "title":
                results.sort(key=lambda r: (paper_map.get(r.paper_id).title or "").lower() if paper_map.get(r.paper_id) else "", reverse=reverse)
            elif sort_by == "created_at":
                results.sort(key=lambda r: paper_map.get(r.paper_id).created_at if paper_map.get(r.paper_id) else None, reverse=reverse)
        finally:
            session.close()

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
            suggestions.append(f"Tháº»: {tag}")
        for p in papers_res:
            suggestions.append(p["title"])

        return {
            "tags": tags_res,
            "papers": papers_res,
            "suggestions": suggestions[:limit * 2]
        }
    finally:
        session.close()
