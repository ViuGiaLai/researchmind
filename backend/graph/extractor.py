"""LLM-based entity and relationship extraction from paper chunks.

MIT License — adapted from microsoft/graphrag:
https://github.com/microsoft/graphrag/blob/main/packages/graphrag/graphrag/index/operations/extract_graph/graph_extractor.py
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from loguru import logger

from academic.governance import get_academic_governance
from app_state import state

from .errors import GraphBuildCancelledError
from .models import GraphEntity, GraphRelationship

# ── Versioned graph extraction schema ────────────────────────────

GRAPH_SCHEMA = get_academic_governance().graph_extraction_schema()
GRAPH_EXTRACTION_PROMPT = GRAPH_SCHEMA.prompt
CONTINUE_PROMPT = (
    "Extract only additional explicitly supported records using the same schema; end with the completion delimiter."
)
LOOP_PROMPT = "Answer Y only if an explicitly supported record is still absent; otherwise answer N."
# ── Parser Constants ─────────────────────────────────────────────

TUPLE_DELIMITER = GRAPH_SCHEMA.tuple_delimiter
RECORD_DELIMITER = GRAPH_SCHEMA.record_delimiter
COMPLETION_DELIMITER = GRAPH_SCHEMA.completion_delimiter
MAX_EXTRACTION_CHARS = 8000  # Truncate LLM output to avoid OOM
MAX_GLEAN_TOTAL_CHARS = 12000  # Cap total accumulated gleaning text


def _clean_str(text: str) -> str:
    return text.strip().strip('"').strip("'")


def _estimate_tokens(text: str) -> int:
    """Rough token estimate (4 chars per token)."""
    return len(text) // 4


def _truncate_to_tokens(text: str, max_chars: int) -> str:
    """Truncate text to approximate token limit at nearest sentence boundary."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    # Cut at last sentence boundary within limit
    for boundary in (". ", "!\n", "?\n", "\n\n"):
        pos = truncated.rfind(boundary)
        if pos > max_chars // 2:
            return truncated[: pos + 1]
    return truncated


def _parse_extraction_result(result: str, source_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Parse structured LLM output into entity and relationship dicts."""
    entities: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []

    records = [r.strip() for r in result.split(RECORD_DELIMITER)]
    for raw_record in records:
        record = re.sub(r"^\(|\)$", "", raw_record.strip())
        if not record or COMPLETION_DELIMITER in record or len(record) < 10:
            continue

        parts = record.split(TUPLE_DELIMITER)
        if not parts:
            continue

        record_type = parts[0].strip().lower().strip('"')

        if record_type == "entity" and len(parts) >= 4:
            entities.append(
                {
                    "title": _clean_str(parts[1]).upper(),
                    "type": _clean_str(parts[2]).upper(),
                    "description": _clean_str(parts[3]),
                    "source_id": source_id,
                }
            )

        if record_type == "relationship" and len(parts) >= 5:
            try:
                weight = float(parts[4].strip().strip('"'))
            except (ValueError, IndexError):
                weight = 1.0
            relationships.append(
                {
                    "source": _clean_str(parts[1]).upper(),
                    "target": _clean_str(parts[2]).upper(),
                    "description": _clean_str(parts[3]),
                    "weight": weight,
                    "source_id": source_id,
                }
            )

    return entities, relationships


def _deduplicate_entities(
    raw: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Deduplicate entities by title, merging descriptions."""
    seen: dict[str, dict[str, Any]] = {}
    for e in raw:
        title = e["title"]
        if title in seen:
            existing = seen[title]
            if e["description"] and e["description"] not in existing.get("description", ""):
                existing["description"] = existing.get("description", "") + "; " + e["description"]
        else:
            seen[title] = e
    return list(seen.values())


def _deduplicate_relationships(
    raw: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Deduplicate relationships by (source, target), keeping first occurrence."""
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, Any]] = []
    for r in raw:
        key = (r["source"], r["target"])
        reverse_key = (r["target"], r["source"])
        if key in seen or reverse_key in seen:
            continue
        seen.add(key)
        result.append(r)
    return result


def _ensure_not_cancelled() -> None:
    if state.build_cancelled:
        raise GraphBuildCancelledError("Build cancelled by user")


# ── Main Extraction Function ─────────────────────────────────────


async def extract_entities_and_relationships(
    text: str,
    source_id: str,
    entity_types: list[str] | None = None,
    generator: Any = None,
    max_gleanings: int = 2,
    max_total_tokens: int = 3000,
) -> tuple[list[GraphEntity], list[GraphRelationship]]:
    """Extract entities and relationships from a text chunk using an LLM.

    The gleaning loop is optimized to:
    - Skip gleaning for small chunks (< 100 chars) where extraction is unlikely to miss much
    - Merge continue + loop check into fewer calls
    - Cap total accumulated text to prevent OOM
    """
    if generator is None:
        logger.warning("No generator provided — returning empty extraction")
        return [], []

    if entity_types is None:
        entity_types = [
            "CONCEPT",
            "METHOD",
            "DATASET",
            "METRIC",
            "MODEL",
            "ALGORITHM",
            "ARCHITECTURE",
            "TASK",
            "DOMAIN",
            "PERSON",
            "ORGANIZATION",
        ]

    # Skip gleaning for very short chunks — extraction is usually sufficient in one pass
    text_stripped = text.strip()
    if len(text_stripped) < 100:
        max_gleanings = 0

    max_gleanings = min(max_gleanings, 3)  # Hard cap at 3 rounds

    prompt = GRAPH_EXTRACTION_PROMPT(
        input_text=_truncate_to_tokens(text_stripped, MAX_EXTRACTION_CHARS),
        entity_types=list(entity_types),
    )

    _ensure_not_cancelled()
    try:
        response = await generator.generate_direct_async(
            user_prompt=prompt,
            system_prompt=get_academic_governance().task_contract("entity_extraction"),
            task_type="entity",
        )
    except GraphBuildCancelledError:
        raise
    except Exception as e:
        logger.error(f"Entity extraction LLM call failed: {e}")
        return [], []

    if not response:
        return [], []

    results = response
    total_chars = len(results)

    if max_gleanings > 0:
        for glean_round in range(max_gleanings):
            _ensure_not_cancelled()
            if total_chars > MAX_GLEAN_TOTAL_CHARS:
                logger.warning(f"Gleaning stopped: accumulated {total_chars} chars (limit {MAX_GLEAN_TOTAL_CHARS})")
                break

            try:
                cont = await generator.generate_direct_async(
                    user_prompt=f"{CONTINUE_PROMPT}\n\nCurrent extraction:\n{results[-2000:]}",
                    system_prompt=get_academic_governance().task_contract("entity_extraction_continue"),
                    task_type="entity",
                )
            except GraphBuildCancelledError:
                raise
            except Exception:
                break

            if not cont:
                break

            results += "\n" + cont
            total_chars += len(cont)

            if glean_round < max_gleanings - 1:
                _ensure_not_cancelled()
                try:
                    loop_resp = await generator.generate_direct_async(
                        user_prompt=f"Are there still unextracted entities or relationships?\n{LOOP_PROMPT}",
                        system_prompt=get_academic_governance().task_contract("entity_extraction_loop"),
                        task_type="entity",
                    )
                except GraphBuildCancelledError:
                    raise
                except Exception:
                    break

                if not loop_resp or loop_resp.strip().upper() != "Y":
                    break

    raw_entities, raw_relationships = _parse_extraction_result(results, source_id)
    allowed_entity_types = {item.upper() for item in entity_types}
    raw_entities = [entity for entity in raw_entities if entity["type"] in allowed_entity_types]
    raw_relationships = [
        {
            **relationship,
            "weight": max(GRAPH_SCHEMA.weight_minimum, min(relationship["weight"], GRAPH_SCHEMA.weight_maximum)),
        }
        for relationship in raw_relationships
    ]

    merged_entities = _deduplicate_entities(raw_entities)
    merged_rels = _deduplicate_relationships(raw_relationships)

    graph_entities = [
        GraphEntity(
            id=str(uuid.uuid4()),
            title=e["title"],
            type=e["type"],
            description=_truncate_to_tokens(e["description"], 500),
            text_unit_ids=[source_id],
            rank=1.0,
        )
        for e in merged_entities
    ]

    graph_relationships = [
        GraphRelationship(
            id=str(uuid.uuid4()),
            source=r["source"],
            target=r["target"],
            weight=r["weight"],  # Validated against GRAPH_SCHEMA
            description=_truncate_to_tokens(r["description"], 300),
            text_unit_ids=[source_id],
        )
        for r in merged_rels
    ]

    logger.info(
        f"Extracted {len(graph_entities)} entities, "
        f"{len(graph_relationships)} relationships from {source_id} "
        f"({total_chars} chars)"
    )

    return graph_entities, graph_relationships
