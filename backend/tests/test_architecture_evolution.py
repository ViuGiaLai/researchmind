"""
Tests for Architecture Evolution components:
- Rule Engine (venue_rules.json & templates.py)
- Tool Layer (academic/tools)
- Knowledge Graph Linker (graph/linker.py)
- Agent Orchestrator (agents/)
"""
import pytest

from academic.tools import ToolResult, get_tool
from agents import AgentContext, run_pipeline
from graph.linker import (
    GraphAuthor,
    GraphDataset,
    GraphMethod,
    GraphMetric,
    GraphVenue,
    infer_venue_from_doi,
    link_external_metadata,
    link_paper_authors,
    link_paper_datasets,
    link_paper_methods,
    link_paper_metrics,
    link_paper_venue,
)
from publishing.templates import PUBLISHING_TEMPLATES, get_all_venues, get_venue_template


def test_rule_engine_venue_json():
    venues = get_all_venues()
    assert "ieee_trans" in venues
    assert "springer_lncs" in venues
    assert "icml" in venues
    assert "iclr" in venues

    cvpr = get_venue_template("cvpr")
    assert cvpr["publisher"] == "IEEE / CVF"
    assert PUBLISHING_TEMPLATES["cvpr"]["publisher"] == "IEEE / CVF"


def test_tool_layer_citation_checker():
    tool = get_tool("citation_checker")
    res: ToolResult = tool.run(
        citations=[
            "[1] Vaswani et al. Attention is all you need. NeurIPS 2017. https://doi.org/10.5555/3295222.3295349",
            "Short invalid cit"
        ],
        venue_id="ieee_trans"
    )
    assert res.success is True
    assert res.data["total"] == 2
    assert len(res.data["verified"]) >= 1


def test_tool_layer_format_auditor():
    tool = get_tool("format_auditor")
    res: ToolResult = tool.run(
        title="Test Paper Title",
        text_content="## Abstract\nShort abstract text.\n\n## Introduction\nIntro text.\n\n## Method\nMethod text.\n\n## Results\nResults text.\n\n## Conclusion\nConclusion.\n\n## References\n[1] Ref 1.",
        venue_id="ieee_trans"
    )
    assert isinstance(res.data, dict)
    assert "overall_score" in res.data


def test_tool_layer_metadata_checker():
    tool = get_tool("metadata_checker")
    res: ToolResult = tool.run(
        text_content="## Abstract\nShort abstract.\n\n## Keywords\nAI, Deep Learning",
        venue_id="ieee_trans",
        metadata={"keywords": ["AI", "Deep Learning"], "orcids": ["0000-0001-2345-6789"]}
    )
    assert "keywords" in res.data["passed_fields"]
    assert "orcid" in res.data["passed_fields"]


def test_tool_layer_exporter():
    tool = get_tool("exporter")
    res: ToolResult = tool.run(
        content="## Abstract\nPaper text.",
        export_format="latex",
        venue_id="ieee_trans",
        title="Sample Paper"
    )
    assert res.success is True
    assert "zip_bytes_len" in res.data
    assert res.data["zip_bytes_len"] > 0


def test_graph_linker_full_7_entities():
    assert infer_venue_from_doi("10.1109/TNNLS.2025.12345") == "TNNLS"
    assert infer_venue_from_doi("10.1038/s42256-025-0001") == "NatMachIntell"

    author_store: dict[str, GraphAuthor] = {}
    authors = link_paper_authors("paper_1", ["John Doe", "Jane Smith"], author_store)
    assert len(authors) == 2
    assert "paper_1" in author_store["john doe"].paper_ids

    venue_store: dict[str, GraphVenue] = {}
    venue = link_paper_venue("paper_1", doi="10.1109/TNNLS.2025", journal=None, venue_store=venue_store)
    assert venue is not None
    assert venue.venue_code == "TNNLS"

    dataset_store: dict[str, GraphDataset] = {}
    ds = link_paper_datasets("paper_1", ["ImageNet", "COCO"], dataset_store)
    assert len(ds) == 2
    assert "paper_1" in dataset_store["imagenet"].paper_ids

    method_store: dict[str, GraphMethod] = {}
    methods = link_paper_methods("paper_1", ["Transformer", "ResNet"], method_store)
    assert len(methods) == 2

    metric_store: dict[str, GraphMetric] = {}
    metrics = link_paper_metrics("paper_1", ["Accuracy", "F1-Score"], metric_store)
    assert len(metrics) == 2

    summary = link_external_metadata(
        paper_id="paper_1",
        crossref_work=None,
        author_store=author_store,
        venue_store=venue_store,
        citation_links=[],
        dataset_store=dataset_store,
        method_store=method_store,
        metric_store=metric_store,
        extracted_datasets=["ImageNet"],
        extracted_methods=["Transformer"],
        extracted_metrics=["Accuracy"],
    )
    assert summary["paper_id"] == "paper_1"
    assert "ImageNet" in summary["datasets_linked"]


@pytest.mark.asyncio
async def test_agent_orchestrator_dry_run():
    ctx = AgentContext(query="What are transformer architectures?", venue_id="ieee_trans")
    assert ctx.query == "What are transformer architectures?"
    assert ctx.produced == set()


@pytest.mark.asyncio
async def test_agent_orchestrator_full_8_step_pipeline():
    res = await run_pipeline(
        query="What are the latest advances in transformer architectures?",
        venue_id="ieee_trans",
        language="en"
    )
    assert res.query == "What are the latest advances in transformer architectures?"
    assert res.governance_version == "1.2.0"
    assert len(res.steps) == 8

    executed_steps = [s.step for s in res.steps]
    assert executed_steps == ["parse", "retrieve", "analyze", "audit", "verify", "auto_fix", "synthesize", "export"]
    assert all(s.success for s in res.steps)

