"""Resolve safe research metadata filters to paper IDs."""
import json
from db.models import Paper
_ALLOWED = {"year_from", "year_to", "authors", "tags", "language", "read_status", "starred"}
def filter_paper_ids(session, filters: dict | None) -> list[str] | None:
    if not filters: return None
    unknown = set(filters) - _ALLOWED
    if unknown: raise ValueError(f"Unsupported metadata filters: {sorted(unknown)}")
    query = session.query(Paper.id)
    if filters.get("year_from") is not None: query = query.filter(Paper.year >= int(filters["year_from"]))
    if filters.get("year_to") is not None: query = query.filter(Paper.year <= int(filters["year_to"]))
    if filters.get("language"): query = query.filter(Paper.language == str(filters["language"]))
    if filters.get("read_status"): query = query.filter(Paper.read_status == str(filters["read_status"]))
    if filters.get("starred") is not None: query = query.filter(Paper.starred == int(bool(filters["starred"])))
    for value in filters.get("authors", []): query = query.filter(Paper.authors.ilike(f"%{value}%"))
    for value in filters.get("tags", []): query = query.filter(Paper.tags.ilike(f"%{value}%"))
    return [row[0] for row in query.all()]
