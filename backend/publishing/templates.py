"""
ResearchMind VN — Venue Rule Engine (v6.0).

All venue templates are loaded from publishing/resources/venue_rules.json
so they can be versioned, updated, and audited without code changes.
"""
from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_RESOURCE = Path(__file__).parent / "resources" / "venue_rules.json"


@lru_cache(maxsize=1)
def load_venue_rules() -> dict[str, Any]:
    """Load versioned venue rule definitions from JSON resource."""
    with _RESOURCE.open(encoding="utf-8") as f:
        data = json.load(f)
    return data


def get_venue_template(venue_id: str) -> dict[str, Any]:
    """Return the venue template dict for a given venue_id."""
    data = load_venue_rules()
    venues = data.get("venues", {})
    if venue_id not in venues:
        return venues.get("ieee_trans", next(iter(venues.values())))
    return venues[venue_id]


def get_all_venues() -> dict[str, dict[str, Any]]:
    """Return all venue templates keyed by venue_id."""
    return load_venue_rules().get("venues", {})


def get_venue_rules_version() -> str:
    """Return the current venue rules resource version."""
    return load_venue_rules().get("version", "unknown")


def get_official_source(venue_id: str) -> str | None:
    """Return the official guideline URL for a venue."""
    return load_venue_rules().get("official_guideline_sources", {}).get(venue_id)


# ---------------------------------------------------------------------------
# Backward-compatibility shim: code that imports PUBLISHING_TEMPLATES directly
# will still work without modification.
# ---------------------------------------------------------------------------
class _TemplateDictProxy(dict):
    """Proxy that loads venue data lazily from JSON on first access."""
    def __getitem__(self, key: str) -> dict[str, Any]:
        data = get_all_venues()
        if key in data:
            return data[key]
        return data.get("ieee_trans", {})

    def get(self, key: str, default: Any = None) -> Any:
        data = get_all_venues()
        if key in data:
            return data[key]
        if default is not None:
            return default
        return data.get("ieee_trans", {})

    def __contains__(self, key: object) -> bool:
        return key in get_all_venues()

    def keys(self):
        return get_all_venues().keys()

    def values(self):
        return get_all_venues().values()

    def items(self):
        return get_all_venues().items()

    def __iter__(self):
        return iter(get_all_venues())

    def __len__(self):
        return len(get_all_venues())


PUBLISHING_TEMPLATES: dict[str, dict[str, Any]] = _TemplateDictProxy()
