import json
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Query
from app_state import state
from db.database import get_session
from db.models import Collection, CollectionPaper, Paper, SavedSearch

router = APIRouter(prefix="/api", tags=["Collections"])


def _collection_to_dict(collection: Collection, paper_count: int = 0) -> dict:
    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "paper_count": paper_count,
        "created_at": str(collection.created_at) if collection.created_at else None,
        "updated_at": str(collection.updated_at) if collection.updated_at else None,
    }


def _saved_search_to_dict(saved: SavedSearch) -> dict:
    try:
        filters = json.loads(saved.filters or "{}")
    except Exception:
        filters = {}
    return {
        "id": saved.id,
        "name": saved.name,
        "query": saved.query,
        "filters": filters,
        "created_at": str(saved.created_at) if saved.created_at else None,
        "updated_at": str(saved.updated_at) if saved.updated_at else None,
    }


@router.get("/collections")
async def list_collections():
    session = get_session(state.engine)
    try:
        collections = session.query(Collection).order_by(Collection.created_at.asc()).all()
        result = []
        for collection in collections:
            count = session.query(CollectionPaper).filter(CollectionPaper.collection_id == collection.id).count()
            result.append(_collection_to_dict(collection, count))
        return {"collections": result}
    finally:
        session.close()


@router.post("/collections")
async def create_collection(body: dict = Body(...)):
    name = (body.get("name") or "").strip()
    description = (body.get("description") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name is required")

    session = get_session(state.engine)
    try:
        collection = Collection(name=name, description=description)
        session.add(collection)
        session.commit()
        return _collection_to_dict(collection, 0)
    finally:
        session.close()


@router.patch("/collections/{collection_id}")
async def update_collection(collection_id: str, body: dict = Body(...)):
    session = get_session(state.engine)
    try:
        collection = session.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        if "name" in body:
            name = (body.get("name") or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Collection name is required")
            collection.name = name
        if "description" in body:
            collection.description = (body.get("description") or "").strip()
        collection.updated_at = datetime.utcnow()
        session.commit()
        count = session.query(CollectionPaper).filter(CollectionPaper.collection_id == collection.id).count()
        return _collection_to_dict(collection, count)
    finally:
        session.close()


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str):
    session = get_session(state.engine)
    try:
        collection = session.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        session.query(CollectionPaper).filter(CollectionPaper.collection_id == collection_id).delete()
        session.delete(collection)
        session.commit()
        return {"status": "deleted", "collection_id": collection_id}
    finally:
        session.close()


@router.get("/collections/{collection_id}/papers")
async def list_collection_papers(collection_id: str):
    session = get_session(state.engine)
    try:
        collection = session.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        paper_ids = [
            row.paper_id
            for row in session.query(CollectionPaper).filter(CollectionPaper.collection_id == collection_id).all()
        ]
        return {"collection_id": collection_id, "paper_ids": paper_ids}
    finally:
        session.close()


@router.post("/collections/{collection_id}/papers")
async def add_papers_to_collection(collection_id: str, body: dict = Body(...)):
    paper_ids = body.get("paper_ids") or []
    if isinstance(paper_ids, str):
        paper_ids = [paper_ids]
    if not paper_ids:
        raise HTTPException(status_code=400, detail="paper_ids is required")

    session = get_session(state.engine)
    try:
        collection = session.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

        existing_paper_ids = {
            row[0] for row in session.query(Paper.id).filter(Paper.id.in_(paper_ids)).all()
        }
        if not existing_paper_ids:
            raise HTTPException(status_code=404, detail="No matching papers found")

        already = {
            row.paper_id
            for row in session.query(CollectionPaper).filter(
                CollectionPaper.collection_id == collection_id,
                CollectionPaper.paper_id.in_(existing_paper_ids),
            ).all()
        }
        to_add = existing_paper_ids - already
        for paper_id in to_add:
            session.add(CollectionPaper(collection_id=collection_id, paper_id=paper_id))
        session.commit()
        return {"status": "ok", "added": len(to_add), "collection_id": collection_id}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.delete("/collections/{collection_id}/papers/{paper_id}")
async def remove_paper_from_collection(collection_id: str, paper_id: str):
    session = get_session(state.engine)
    try:
        deleted = session.query(CollectionPaper).filter(
            CollectionPaper.collection_id == collection_id,
            CollectionPaper.paper_id == paper_id,
        ).delete()
        session.commit()
        return {"status": "removed", "removed": deleted}
    finally:
        session.close()


@router.get("/saved-searches")
async def list_saved_searches():
    session = get_session(state.engine)
    try:
        saved = session.query(SavedSearch).order_by(SavedSearch.created_at.desc()).all()
        return {"saved_searches": [_saved_search_to_dict(item) for item in saved]}
    finally:
        session.close()


@router.post("/saved-searches")
async def create_saved_search(body: dict = Body(...)):
    name = (body.get("name") or "").strip()
    query = (body.get("query") or "").strip()
    filters = body.get("filters") or {}
    if not name or not query:
        raise HTTPException(status_code=400, detail="name and query are required")

    session = get_session(state.engine)
    try:
        saved = SavedSearch(name=name, query=query, filters=json.dumps(filters, ensure_ascii=False))
        session.add(saved)
        session.commit()
        return _saved_search_to_dict(saved)
    finally:
        session.close()


@router.delete("/saved-searches/{saved_search_id}")
async def delete_saved_search(saved_search_id: str):
    session = get_session(state.engine)
    try:
        deleted = session.query(SavedSearch).filter(SavedSearch.id == saved_search_id).delete()
        session.commit()
        if not deleted:
            raise HTTPException(status_code=404, detail="Saved search not found")
        return {"status": "deleted", "saved_search_id": saved_search_id}
    finally:
        session.close()
