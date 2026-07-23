"""Expand matched child chunks with adjacent parent context."""
from db.models import Chunk


def expand_parent_context(session, chunks: list[dict], radius: int = 1) -> list[dict]:
    result = []
    for child in chunks:
        index = int(child.get("chunk_index", 0)); paper_id = child.get("paper_id")
        rows = session.query(Chunk).filter(Chunk.paper_id == paper_id, Chunk.chunk_index.between(max(0, index-radius), index+radius)).order_by(Chunk.chunk_index).all()
        expanded = dict(child)
        if rows:
            expanded["content"] = "\n".join(row.content for row in rows)
            expanded["child_chunk_id"] = child.get("chunk_id")
            expanded["parent_chunk_indices"] = [row.chunk_index for row in rows]
        result.append(expanded)
    return result
