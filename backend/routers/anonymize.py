"""API Router: Anonymization Engine

Endpoints:
  POST   /api/anonymize/{paper_id}         — Run anonymization on a paper
  GET    /api/anonymize/{paper_id}         — Get current anonymization status
  POST   /api/anonymize/{paper_id}/toggle  — Toggle anonymization on/off
  DELETE /api/anonymize/{paper_id}         — Remove anonymization map
  GET    /api/anonymize/{paper_id}/map     — Get the entity map (for transparency)
  POST   /api/anonymize/{paper_id}/text    — Get anonymized/deanonymized text on-demand
"""

import json

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from anonymization.engine import AnonymizationEngine, AnonymizationResult
from app_state import state
from db.database import get_session
from db.models import AnonymizationMap, Chunk, Paper

router = APIRouter(prefix="/api/anonymize", tags=["Anonymization"])

_engine = AnonymizationEngine()


# ─── Schemas ──────────────────────────────────────────────────────


class AnonymizationStatus(BaseModel):
    paper_id: str
    is_active: bool
    entities_found: int
    has_map: bool
    stats: dict[str, int]


class EntityMapEntry(BaseModel):
    label: str
    entity_type: str
    count: int


class EntityMapResponse(BaseModel):
    paper_id: str
    entities: dict[str, EntityMapEntry]  # original → entry


class AnonymizeRequest(BaseModel):
    force_refresh: bool = False  # Re-run even if map already exists


class TextRequest(BaseModel):
    raw_text: str


# ─── Helpers ──────────────────────────────────────────────────────


def _get_paper_full_text(paper_id: str, session) -> str:
    """Ghép toàn bộ chunks của paper thành một đoạn text liên tục."""
    chunks = session.query(Chunk).filter(Chunk.paper_id == paper_id).order_by(Chunk.chunk_index).all()
    if not chunks:
        return ""
    return "\n\n".join(c.content for c in chunks)


def _compute_stats(entity_map_json: str) -> dict[str, int]:
    """Tính thống kê số lượng từng loại entity từ JSON."""
    try:
        data = json.loads(entity_map_json)
        stats: dict[str, int] = {}
        for info in data.values():
            etype = info.get("entity_type", "UNKNOWN")
            stats[etype] = stats.get(etype, 0) + 1
        return stats
    except Exception:
        return {}


# ─── Endpoints ────────────────────────────────────────────────────


@router.post("/{paper_id}", response_model=AnonymizationStatus)
async def run_anonymization(paper_id: str, req: AnonymizeRequest = None):
    """
    Chạy anonymization cho paper. Nếu đã có map và không force_refresh,
    chỉ kích hoạt lại mà không chạy lại.
    """
    if req is None:
        req = AnonymizeRequest()

    session = get_session(state.engine)
    try:
        paper = session.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        existing = session.query(AnonymizationMap).filter(AnonymizationMap.paper_id == paper_id).first()

        if existing and not req.force_refresh:
            # Map đã có, chỉ kích hoạt
            existing.is_active = 1
            session.commit()
            stats = _compute_stats(existing.entity_map_json)
            return AnonymizationStatus(
                paper_id=paper_id,
                is_active=True,
                entities_found=existing.entities_found,
                has_map=True,
                stats=stats,
            )

        # Lấy text của paper từ chunks
        full_text = _get_paper_full_text(paper_id, session)
        if not full_text:
            raise HTTPException(
                status_code=422,
                detail="Paper has no indexed text. Please ensure the paper has been imported and indexed first.",
            )

        # Lấy danh sách tác giả từ metadata để bổ sung vào entity map
        try:
            authors = json.loads(paper.authors or "[]")
            if not isinstance(authors, list):
                authors = []
        except Exception:
            authors = []

        # Chạy anonymization
        result: AnonymizationResult = _engine.anonymize(full_text)

        # Bổ sung tác giả từ metadata (đảm bảo không bị bỏ sót)
        result = _engine.merge_with_paper_metadata(
            result,
            title=paper.title or "",
            authors=[str(a) for a in authors],
            doi=paper.doi or "",
        )

        total_entities = sum(result.stats.values())

        if existing:
            existing.entity_map_json = result.to_json()
            existing.anonymized_text = result.anonymized_text
            existing.is_active = 1
            existing.entities_found = total_entities
        else:
            new_map = AnonymizationMap(
                paper_id=paper_id,
                entity_map_json=result.to_json(),
                anonymized_text=result.anonymized_text,
                is_active=1,
                entities_found=total_entities,
            )
            session.add(new_map)

        session.commit()

        logger.info(f"Anonymized paper {paper_id}: {total_entities} entities ({result.stats})")

        return AnonymizationStatus(
            paper_id=paper_id,
            is_active=True,
            entities_found=total_entities,
            has_map=True,
            stats=result.stats,
        )

    finally:
        session.close()


@router.get("/{paper_id}", response_model=AnonymizationStatus)
async def get_anonymization_status(paper_id: str):
    """Lấy trạng thái anonymization của paper."""
    session = get_session(state.engine)
    try:
        existing = session.query(AnonymizationMap).filter(AnonymizationMap.paper_id == paper_id).first()
        if not existing:
            return AnonymizationStatus(
                paper_id=paper_id,
                is_active=False,
                entities_found=0,
                has_map=False,
                stats={},
            )
        stats = _compute_stats(existing.entity_map_json)
        return AnonymizationStatus(
            paper_id=paper_id,
            is_active=bool(existing.is_active),
            entities_found=existing.entities_found,
            has_map=True,
            stats=stats,
        )
    finally:
        session.close()


@router.post("/{paper_id}/toggle", response_model=AnonymizationStatus)
async def toggle_anonymization(paper_id: str):
    """
    Bật/Tắt chế độ ẩn danh cho paper.
    Nếu chưa có map, tự động chạy anonymization lần đầu.
    """
    session = get_session(state.engine)
    try:
        existing = session.query(AnonymizationMap).filter(AnonymizationMap.paper_id == paper_id).first()

        if not existing:
            # Chưa có map → tự động chạy lần đầu
            session.close()
            return await run_anonymization(paper_id, AnonymizeRequest())

        # Toggle
        existing.is_active = 0 if existing.is_active else 1
        session.commit()

        stats = _compute_stats(existing.entity_map_json)
        return AnonymizationStatus(
            paper_id=paper_id,
            is_active=bool(existing.is_active),
            entities_found=existing.entities_found,
            has_map=True,
            stats=stats,
        )
    finally:
        session.close()


@router.delete("/{paper_id}")
async def remove_anonymization(paper_id: str):
    """Xóa toàn bộ anonymization map của paper. Không thể hoàn tác."""
    session = get_session(state.engine)
    try:
        existing = session.query(AnonymizationMap).filter(AnonymizationMap.paper_id == paper_id).first()
        if not existing:
            raise HTTPException(status_code=404, detail="No anonymization map found for this paper")
        session.delete(existing)
        session.commit()
        logger.info(f"Removed anonymization map for paper {paper_id}")
        return {"detail": "Anonymization map removed successfully"}
    finally:
        session.close()


@router.get("/{paper_id}/map", response_model=EntityMapResponse)
async def get_entity_map(paper_id: str):
    """
    Lấy entity map (mapping từ tên thật → label ẩn danh).
    Endpoint này chỉ dùng cho debugging / UI transparency.
    """
    session = get_session(state.engine)
    try:
        existing = session.query(AnonymizationMap).filter(AnonymizationMap.paper_id == paper_id).first()
        if not existing:
            raise HTTPException(status_code=404, detail="No anonymization map found")

        try:
            data = json.loads(existing.entity_map_json)
        except Exception:
            data = {}

        entities = {
            original: EntityMapEntry(
                label=info["label"],
                entity_type=info["entity_type"],
                count=info.get("count", 0),
            )
            for original, info in data.items()
        }
        return EntityMapResponse(paper_id=paper_id, entities=entities)
    finally:
        session.close()


@router.post("/{paper_id}/anonymize-text")
async def anonymize_text_snippet(paper_id: str, req: TextRequest):
    """
    Anonymize một đoạn text bất kỳ sử dụng entity map của paper.
    Hữu ích để đảm bảo tên trong Chat prompt cũng được ẩn danh.
    """
    session = get_session(state.engine)
    try:
        existing = session.query(AnonymizationMap).filter(AnonymizationMap.paper_id == paper_id).first()
        if not existing or not existing.is_active:
            return {"text": req.raw_text, "anonymized": False}

        try:
            from anonymization.engine import EntityEntry

            entity_data = json.loads(existing.entity_map_json)
            entity_map = {
                orig: EntityEntry(
                    original=orig,
                    label=info["label"],
                    entity_type=info["entity_type"],
                    count=info.get("count", 0),
                )
                for orig, info in entity_data.items()
            }
        except Exception as e:
            logger.warning(f"Failed to load entity map: {e}")
            return {"text": req.raw_text, "anonymized": False}

        result = _engine.anonymize(req.raw_text, existing_map=entity_map)
        return {"text": result.anonymized_text, "anonymized": True}
    finally:
        session.close()
