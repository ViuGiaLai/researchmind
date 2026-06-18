"""
Ghép local RAG context với external academic data thành 1 prompt context.
LLM nhận context này để generate câu trả lời có chứng cứ.
"""
from dataclasses import dataclass, field
from typing import Optional

from .openalex import OpenAlexWork
from .crossref import CrossrefWork
from .semantic_scholar import S2Paper


@dataclass
class ExternalPaperData:
    doi: str
    title: str
    openalex: Optional[OpenAlexWork]
    crossref: Optional[CrossrefWork]
    recent_citing: list[dict] = field(default_factory=list)
    semantic_scholar: Optional[S2Paper] = None
    s2_citations: list[S2Paper] = field(default_factory=list)
    s2_recommendations: list[S2Paper] = field(default_factory=list)
