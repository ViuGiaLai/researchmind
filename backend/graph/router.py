"""GraphRAG API endpoints — build, query, visualize, manage."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from loguru import logger
from pydantic import BaseModel

from app_state import state
from common.i18n import get_language, t
from db.database import get_session
from db.models import Chunk

from .builder import build_graph_from_chunks
from .drift_search import drift_search
from .errors import GraphBuildCancelled
from .global_search import global_search
from .local_search import local_search
from .storage import GraphStore

router = APIRouter(prefix="/api/graph", tags=["GraphRAG"])


class GraphQuery(BaseModel):
    query: str
    strategy: str = "local"  # "local", "global", "drift"
    top_k_entities: int = 10
    top_k_relationships: int = 10
    max_drift_steps: int = 3


class GraphBuildRequest(BaseModel):
    paper_ids: list[str] | None = None
    entity_types: list[str] | None = None
    max_gleanings: int = 2


class GraphStatsResponse(BaseModel):
    entities: int
    relationships: int
    communities: int
    community_reports: int
    text_units: int


class EntityResponse(BaseModel):
    id: str
    title: str
    type: str | None
    description: str | None
    rank: float
    community_ids: list[str]
    relationships: list[dict[str, Any]] = []


# ─── Graph store accessor ─────────────────────────────────────────

def _get_graph_store() -> GraphStore:
    """Get the graph store from app state (initialized in main.py lifespan)."""
    store = getattr(state, "_graph_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Graph store not initialized")
    return store


# ─── Endpoints ───────────────────────────────────────────────────

async def _run_graph_build(
    chunk_dicts: list[dict[str, Any]],
    store: GraphStore,
    generator: Any,
    entity_types: list[str] | None,
    max_gleanings: int,
    lang: str = "vi",
) -> None:
    try:
        graph = await build_graph_from_chunks(
            chunks=chunk_dicts,
            graph_store=store,
            generator=generator,
            entity_types=entity_types,
            max_gleanings=max_gleanings,
            lang=lang,
        )
        if not state.build_cancelled:
            stats = graph.stats()
            state.build_progress = {
                "phase": "done",
                "current": stats.get("text_units", 0),
                "total": stats.get("text_units", 0),
                "percent": 100,
                "message": t("graph.completed", lang),
                "stats": stats,
            }
    except GraphBuildCancelled:
        stats = store.graph.stats()
        state.build_progress = {
            "phase": "cancelled",
            "current": stats.get("text_units", 0),
            "total": len(chunk_dicts),
            "percent": state.build_progress.get("percent", 0),
            "message": t("graph.cancelled", lang),
            "stats": stats,
        }
    except Exception as e:
        logger.exception("Graph build failed")
        state.build_progress = {
            "phase": "error",
            "current": 0,
            "total": len(chunk_dicts),
            "percent": 0,
            "message": str(e),
        }
    finally:
        state.build_running = False
        state.build_tasks = []


@router.post("/build")
async def build_graph(req: GraphBuildRequest, request: Request):
    """Start knowledge graph build in the background."""
    lang = get_language(request)
    if getattr(state, "build_running", False):
        raise HTTPException(status_code=409, detail=t("graph.already_building", lang))

    store = _get_graph_store()

    session = get_session(state.engine)
    try:
        query = session.query(Chunk)
        if req.paper_ids:
            query = query.filter(Chunk.paper_id.in_(req.paper_ids))
        chunks = query.order_by(Chunk.paper_id, Chunk.chunk_index).all()
    finally:
        session.close()

    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks found to build graph from")

    chunk_dicts = [
        {
            "id": c.id,
            "text": c.content,
            "paper_id": c.paper_id,
            "chunk_index": c.chunk_index,
        }
        for c in chunks
    ]

    generator = getattr(state, "generator", None)
    if generator is None:
        raise HTTPException(status_code=503, detail="Generator not initialized")

    state.build_cancelled = False
    state.build_running = True
    state.build_tasks = []
    state.build_progress = {
        "phase": "extract",
        "current": 0,
        "total": len(chunk_dicts),
        "percent": 0,
        "message": t("graph.extracting_chunks", lang, count=len(chunk_dicts)),
    }

    asyncio.create_task(
        _run_graph_build(
            chunk_dicts,
            store,
            generator,
            req.entity_types,
            req.max_gleanings,
            lang,
        )
    )

    return {
        "status": "started",
        "message": t("graph.building", lang, count=len(chunk_dicts)),
        "total_chunks": len(chunk_dicts),
    }


@router.get("/build-progress")
async def build_progress():
    """Get current build progress."""
    return state.build_progress


@router.post("/build/cancel")
async def cancel_build(request: Request):
    """Cancel the current graph build."""
    lang = get_language(request)
    if not getattr(state, "build_running", False):
        return {"status": "ok", "message": t("graph.no_build_running", lang)}

    state.build_cancelled = True
    state.build_progress = {
        **state.build_progress,
        "phase": "cancelling",
        "message": t("graph.cancelling", lang),
    }

    tasks = list(getattr(state, "build_tasks", []))
    for task in tasks:
        if not task.done():
            task.cancel()

    return {"status": "ok", "message": "Build cancellation requested"}


@router.post("/query")
async def query_graph(req: GraphQuery):
    """Query the knowledge graph using the specified strategy."""
    store = _get_graph_store()
    if store is None:
        raise HTTPException(status_code=500, detail="Graph store not available")

    generator = getattr(state, "generator", None)
    graph = store.graph

    if not graph.entities:
        raise HTTPException(status_code=400, detail="Graph is empty. Build it first via POST /api/graph/build")

    try:
        if req.strategy == "local":
            answer = await local_search(
                query=req.query,
                graph=graph,
                generator=generator,
                top_k_entities=req.top_k_entities,
                top_k_relationships=req.top_k_relationships,
            )
        elif req.strategy == "global":
            answer = await global_search(
                query=req.query,
                graph=graph,
                generator=generator,
            )
        elif req.strategy == "drift":
            answer = await drift_search(
                query=req.query,
                graph=graph,
                generator=generator,
                max_drift_steps=req.max_drift_steps,
                top_k_entities=req.top_k_entities,
                top_k_relationships=req.top_k_relationships,
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown strategy: {req.strategy}")

        return {"answer": answer, "strategy": req.strategy, "stats": graph.stats()}
    except Exception as e:
        logger.exception(f"Graph query failed ({req.strategy})")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=GraphStatsResponse)
async def graph_stats():
    """Get knowledge graph statistics."""
    store = _get_graph_store()
    if store is None:
        raise HTTPException(status_code=500, detail="Graph store not available")
    stats = store.graph.stats()
    return GraphStatsResponse(**stats)


@router.get("/entities")
async def list_entities(limit: int = 50, offset: int = 0):
    """List all entities in the knowledge graph."""
    store = _get_graph_store()
    if store is None:
        raise HTTPException(status_code=500, detail="Graph store not available")

    entity_list = list(store.graph.entities.values())
    entity_list.sort(key=lambda e: e.rank or 0, reverse=True)
    page = entity_list[offset:offset + limit]

    return [
        EntityResponse(
            id=e.id,
            title=e.title,
            type=e.type,
            description=e.description,
            rank=e.rank or 1.0,
            community_ids=e.community_ids or [],
            relationships=[
                {"source": r.source, "target": r.target, "weight": r.weight}
                for r in store.graph.get_relationships_for_entity(e.title)
            ],
        )
        for e in page
    ]


@router.get("/entities/{title}")
async def get_entity(title: str):
    """Get a specific entity with its relationships."""
    store = _get_graph_store()
    if store is None:
        raise HTTPException(status_code=500, detail="Graph store not available")

    entity = store.graph.get_entity_by_title(title)
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity '{title}' not found")

    return EntityResponse(
        id=entity.id,
        title=entity.title,
        type=entity.type,
        description=entity.description,
        rank=entity.rank or 1.0,
        community_ids=entity.community_ids or [],
        relationships=[
            {"source": r.source, "target": r.target, "weight": r.weight, "description": r.description}
            for r in store.graph.get_relationships_for_entity(entity.title)
        ],
    )


@router.get("/communities")
async def list_communities():
    """List all communities."""
    store = _get_graph_store()
    if store is None:
        raise HTTPException(status_code=500, detail="Graph store not available")

    return [
        {
            "id": c.id,
            "title": c.title,
            "level": c.level,
            "size": c.size,
            "report": store.graph.community_reports.get(c.id).summary
            if c.id in store.graph.community_reports else None,
        }
        for c in store.graph.communities.values()
    ]


@router.get("/graph-data")
async def graph_visualization_data():
    """Get full graph data for frontend visualization (nodes + edges)."""
    store = _get_graph_store()
    if store is None:
        raise HTTPException(status_code=500, detail="Graph store not available")

    nodes = [
        {
            "id": e.id,
            "label": e.title,
            "type": e.type or "concept",
            "rank": e.rank or 1.0,
            "community_id": e.community_ids[0] if e.community_ids else None,
        }
        for e in store.graph.entities.values()
    ]

    edges = [
        {
            "source": r.source,
            "target": r.target,
            "weight": r.weight,
            "description": r.description,
        }
        for r in store.graph.relationships.values()
    ]

    return {"nodes": nodes, "edges": edges}


@router.post("/clear")
async def clear_graph():
    """Clear the knowledge graph."""
    store = _get_graph_store()
    if store is None:
        raise HTTPException(status_code=500, detail="Graph store not available")
    store.clear_all()
    return {"status": "ok", "message": "Graph cleared"}
