"""Academic Ontology — 10 core academic entities and relational schema.

Entities: Paper, Author, Venue, Method, Dataset, Metric, Experiment, Claim, Evidence, Limitation.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PaperEntity:
    id: str
    title: str
    authors: list[str] = field(default_factory=list)
    venue: str | None = None
    year: int | None = None
    doi: str | None = None
    abstract: str = ""


@dataclass
class AuthorEntity:
    name: str
    orcid: str | None = None
    affiliation: str | None = None
    paper_ids: list[str] = field(default_factory=list)


@dataclass
class VenueEntity:
    venue_code: str
    name: str
    publisher: str = ""
    venue_type: str = "journal"
    paper_ids: list[str] = field(default_factory=list)


@dataclass
class MethodEntity:
    name: str
    category: str = "algorithm"
    description: str = ""
    paper_ids: list[str] = field(default_factory=list)


@dataclass
class DatasetEntity:
    name: str
    domain: str = "computer_science"
    url: str | None = None
    paper_ids: list[str] = field(default_factory=list)


@dataclass
class MetricEntity:
    name: str
    unit: str = ""
    higher_is_better: bool = True
    paper_ids: list[str] = field(default_factory=list)


@dataclass
class ExperimentEntity:
    id: str
    paper_id: str
    method_name: str
    dataset_name: str
    metric_name: str
    value: float
    is_sota: bool = False


@dataclass
class ClaimEntity:
    id: str
    paper_id: str
    statement: str
    claim_type: str = "empirical"  # empirical | theoretical | methodological
    supported: bool = True


@dataclass
class EvidenceEntity:
    id: str
    paper_id: str
    passage: str
    page: int | None = None
    section: str = ""
    confidence: float = 1.0


@dataclass
class LimitationEntity:
    id: str
    paper_id: str
    description: str
    category: str = "methodological"  # methodological | data | scope | computational


class AcademicOntologyGraph:
    """Graph model connecting all 10 academic entities."""

    def __init__(self):
        self.papers: dict[str, PaperEntity] = {}
        self.authors: dict[str, AuthorEntity] = {}
        self.venues: dict[str, VenueEntity] = {}
        self.methods: dict[str, MethodEntity] = {}
        self.datasets: dict[str, DatasetEntity] = {}
        self.metrics: dict[str, MetricEntity] = {}
        self.experiments: dict[str, ExperimentEntity] = {}
        self.claims: dict[str, ClaimEntity] = {}
        self.evidence: dict[str, EvidenceEntity] = {}
        self.limitations: dict[str, LimitationEntity] = {}

    def add_paper(self, paper: PaperEntity):
        self.papers[paper.id] = paper

    def add_experiment(self, exp: ExperimentEntity):
        self.experiments[exp.id] = exp

    def add_claim(self, claim: ClaimEntity):
        self.claims[claim.id] = claim

    def add_evidence(self, ev: EvidenceEntity):
        self.evidence[ev.id] = ev

    def add_limitation(self, lim: LimitationEntity):
        self.limitations[lim.id] = lim

    def get_summary_stats(self) -> dict[str, int]:
        return {
            "papers": len(self.papers),
            "authors": len(self.authors),
            "venues": len(self.venues),
            "methods": len(self.methods),
            "datasets": len(self.datasets),
            "metrics": len(self.metrics),
            "experiments": len(self.experiments),
            "claims": len(self.claims),
            "evidence": len(self.evidence),
            "limitations": len(self.limitations),
        }
