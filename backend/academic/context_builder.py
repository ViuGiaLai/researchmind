"""Combine local RAG context and external academic data for grounded LLM answers."""
from dataclasses import dataclass, field

from .crossref import CrossrefWork
from .openalex import OpenAlexWork
from .semantic_scholar import S2Paper


@dataclass
class ExternalPaperData:
    doi: str
    title: str
    openalex: OpenAlexWork | None
    crossref: CrossrefWork | None
    recent_citing: list[dict] = field(default_factory=list)
    semantic_scholar: S2Paper | None = None
    s2_citations: list[S2Paper] = field(default_factory=list)
    s2_recommendations: list[S2Paper] = field(default_factory=list)
