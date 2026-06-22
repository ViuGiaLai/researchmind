"""GraphRAG API endpoints — build, query, visualize, manage."""

from __future__ import annotations
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from typing import Any

from loguru import logger

from app_state import state
from db.database import get_session
from db.models import Chunk

from .storage import GraphStore
from .builder import build_graph_from_chunks
from .local_search import local_search
from .global_search import global_search
from .drift_search import drift_search

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

@router.post("/build")
async def build_graph(req: GraphBuildRequest):
    """Build knowledge graph from paper chunks."""
    store = _get_graph_store()

    # Fetch chunks
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

    try:
        graph = await build_graph_from_chunks(
            chunks=chunk_dicts,
            graph_store=store,
            generator=generator,
            entity_types=req.entity_types,
            max_gleanings=req.max_gleanings,
        )
        return {"status": "ok", "stats": graph.stats()}
    except Exception as e:
        logger.exception("Graph build failed")
        raise HTTPException(status_code=500, detail=str(e))


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
