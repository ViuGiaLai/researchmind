"""Knowledge Graph entity linker — connects external metadata and paper extractions to graph nodes.

Links Paper ↔ Author ↔ Venue ↔ Citation ↔ Dataset ↔ Method ↔ Metric after DOI resolution and entity extraction.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Any
from loguru import logger


@dataclass
class GraphAuthor:
    """Normalized author node for the knowledge graph."""
    name: str
    orcid: Optional[str] = None
    affiliation: Optional[str] = None
    paper_ids: list[str] = None

    def __post_init__(self):
        if self.paper_ids is None:
            self.paper_ids = []


@dataclass
class GraphVenue:
    """Normalized venue node for the knowledge graph."""
    venue_code: str
    name: str
    publisher: str
    venue_type: str  # 'conference' | 'journal' | 'workshop' | 'preprint'
    paper_ids: list[str] = None

    def __post_init__(self):
        if self.paper_ids is None:
            self.paper_ids = []


@dataclass
class CitationLink:
    """A directed citation edge: source_paper cites target_doi."""
    source_paper_id: str
    target_doi: str
    target_title: Optional[str] = None
    is_verified: bool = False  # True after Crossref lookup


@dataclass
class GraphDataset:
    """Dataset node linked to papers."""
    name: str
    url: Optional[str] = None
    paper_ids: list[str] = None

    def __post_init__(self):
        if self.paper_ids is None:
            self.paper_ids = []


@dataclass
class GraphMethod:
    """Method/Algorithm node linked to papers."""
    name: str
    category: Optional[str] = None
    paper_ids: list[str] = None

    def __post_init__(self):
        if self.paper_ids is None:
            self.paper_ids = []


@dataclass
class GraphMetric:
    """Evaluation metric node linked to papers."""
    name: str
    unit: Optional[str] = None
    paper_ids: list[str] = None

    def __post_init__(self):
        if self.paper_ids is None:
            self.paper_ids = []


def infer_venue_from_doi(doi: str) -> Optional[str]:
    """Infer venue code from DOI prefix patterns.

    Uses pattern matching — no external API call.
    Returns a venue_code or None if unknown.
    """
    doi_lower = doi.lower()
    patterns = [
        ("10.1109/tnnls", "TNNLS"),
        ("10.1109/cvpr", "CVPR"),
        ("10.1145", "ACM"),
        ("10.1038/s42256", "NatMachIntell"),
        ("10.1038", "Nature"),
        ("10.5555", "ACM-DL"),
        ("10.18653", "ACL"),
        ("10.48550", "arXiv"),
    ]
    for prefix, code in patterns:
        if doi_lower.startswith(prefix):
            return code
    return None


def link_paper_authors(
    paper_id: str,
    authors: list[str],
    author_store: dict[str, GraphAuthor],
) -> list[GraphAuthor]:
    """Link a paper to its authors, updating the author_store in-place."""
    linked: list[GraphAuthor] = []
    for name in authors:
        name = name.strip()
        if not name:
            continue
        key = name.lower()
        if key not in author_store:
            author_store[key] = GraphAuthor(name=name)
        author = author_store[key]
        if paper_id not in author.paper_ids:
            author.paper_ids.append(paper_id)
        linked.append(author)
    return linked


def link_paper_venue(
    paper_id: str,
    doi: Optional[str],
    journal: Optional[str],
    venue_store: dict[str, GraphVenue],
) -> Optional[GraphVenue]:
    """Link a paper to a venue node, creating the node if it doesn't exist."""
    venue_code: Optional[str] = None
    venue_name = journal or ""

    if doi:
        venue_code = infer_venue_from_doi(doi)
    if not venue_code and journal:
        venue_code = journal[:20].upper().replace(" ", "_")
    if not venue_code:
        return None

    if venue_code not in venue_store:
        venue_store[venue_code] = GraphVenue(
            venue_code=venue_code,
            name=venue_name or venue_code,
            publisher="unknown",
            venue_type="journal" if journal else "unknown",
        )
    venue = venue_store[venue_code]
    if paper_id not in venue.paper_ids:
        venue.paper_ids.append(paper_id)
    return venue


def link_paper_datasets(
    paper_id: str,
    datasets: list[str],
    dataset_store: dict[str, GraphDataset],
) -> list[GraphDataset]:
    """Link a paper to dataset nodes in dataset_store."""
    linked: list[GraphDataset] = []
    for name in datasets:
        name = name.strip()
        if not name:
            continue
        key = name.lower()
        if key not in dataset_store:
            dataset_store[key] = GraphDataset(name=name)
        ds = dataset_store[key]
        if paper_id not in ds.paper_ids:
            ds.paper_ids.append(paper_id)
        linked.append(ds)
    return linked


def link_paper_methods(
    paper_id: str,
    methods: list[str],
    method_store: dict[str, GraphMethod],
) -> list[GraphMethod]:
    """Link a paper to method/algorithm nodes in method_store."""
    linked: list[GraphMethod] = []
    for name in methods:
        name = name.strip()
        if not name:
            continue
        key = name.lower()
        if key not in method_store:
            method_store[key] = GraphMethod(name=name)
        m = method_store[key]
        if paper_id not in m.paper_ids:
            m.paper_ids.append(paper_id)
        linked.append(m)
    return linked


def link_paper_metrics(
    paper_id: str,
    metrics: list[str],
    metric_store: dict[str, GraphMetric],
) -> list[GraphMetric]:
    """Link a paper to evaluation metric nodes in metric_store."""
    linked: list[GraphMetric] = []
    for name in metrics:
        name = name.strip()
        if not name:
            continue
        key = name.lower()
        if key not in metric_store:
            metric_store[key] = GraphMetric(name=name)
        met = metric_store[key]
        if paper_id not in met.paper_ids:
            met.paper_ids.append(paper_id)
        linked.append(met)
    return linked


def link_external_metadata(
    paper_id: str,
    crossref_work: Any,
    author_store: dict[str, GraphAuthor],
    venue_store: dict[str, GraphVenue],
    citation_links: list[CitationLink],
    dataset_store: dict[str, GraphDataset] | None = None,
    method_store: dict[str, GraphMethod] | None = None,
    metric_store: dict[str, GraphMetric] | None = None,
    extracted_datasets: list[str] | None = None,
    extracted_methods: list[str] | None = None,
    extracted_metrics: list[str] | None = None,
) -> dict[str, Any]:
    """After DOI resolution & entity extraction, update the knowledge graph across all 7 entity types:
    Paper ↔ Author ↔ Venue ↔ Citation ↔ Dataset ↔ Method ↔ Metric.
    """
    linked_authors = link_paper_authors(paper_id, getattr(crossref_work, 'authors', []), author_store)
    linked_venue = link_paper_venue(
        paper_id,
        doi=getattr(crossref_work, 'doi', None),
        journal=getattr(crossref_work, 'journal', None),
        venue_store=venue_store,
    )

    linked_datasets = link_paper_datasets(paper_id, extracted_datasets or [], dataset_store or {}) if dataset_store is not None else []
    linked_methods = link_paper_methods(paper_id, extracted_methods or [], method_store or {}) if method_store is not None else []
    linked_metrics = link_paper_metrics(paper_id, extracted_metrics or [], metric_store or {}) if metric_store is not None else []

    logger.info(
        f"Linked paper {paper_id}: {len(linked_authors)} authors, "
        f"venue={linked_venue.venue_code if linked_venue else 'none'}, "
        f"datasets={len(linked_datasets)}, methods={len(linked_methods)}, metrics={len(linked_metrics)}"
    )

    return {
        "paper_id": paper_id,
        "authors_linked": [a.name for a in linked_authors],
        "venue_linked": linked_venue.venue_code if linked_venue else None,
        "datasets_linked": [d.name for d in linked_datasets],
        "methods_linked": [m.name for m in linked_methods],
        "metrics_linked": [met.name for met in linked_metrics],
        "citations_pending": len(citation_links),
    }
