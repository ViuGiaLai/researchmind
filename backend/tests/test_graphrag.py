"""Unit tests for GraphRAG — models, storage, extractor, cluster, local_search."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from graph.models import (
    GraphCommunity,
    GraphCommunityReport,
    GraphEntity,
    GraphRelationship,
    GraphTextUnit,
)
from graph.storage import GraphStore, KnowledgeGraph

# ═══════════════════════════════════════════════════════════════════
# Data Models
# ═══════════════════════════════════════════════════════════════════


class TestGraphEntity:
    def test_create_minimal(self):
        e = GraphEntity(id="e1", title="TRANSFORMER")
        assert e.id == "e1"
        assert e.title == "TRANSFORMER"
        assert e.type is None
        assert e.rank == 1.0

    def test_create_full(self):
        e = GraphEntity(
            id="e1",
            title="TRANSFORMER",
            type="MODEL",
            description="A neural network architecture",
            description_embedding=[0.1, 0.2],
            community_ids=["c1"],
            text_unit_ids=["tu1"],
            rank=5.0,
        )
        assert e.type == "MODEL"
        assert e.description_embedding == [0.1, 0.2]

    def test_to_dict(self):
        e = GraphEntity(id="e1", title="CNN", type="MODEL", description="Convolutional")
        d = e.to_dict()
        assert d["title"] == "CNN"
        assert d["type"] == "MODEL"
        assert d["rank"] == 1.0
        assert d["community_ids"] == []


class TestGraphRelationship:
    def test_create(self):
        r = GraphRelationship(
            id="r1",
            source="TRANSFORMER",
            target="ATTENTION",
            weight=0.95,
            description="Uses attention mechanism",
        )
        assert r.source == "TRANSFORMER"
        assert r.weight == 0.95

    def test_default_weight(self):
        r = GraphRelationship(id="r1", source="A", target="B")
        assert r.weight == 1.0


class TestGraphCommunity:
    def test_create_hierarchical(self):
        c = GraphCommunity(
            id="c1",
            title="L1_C0",
            level=1,
            parent="c0",
            entity_ids=["e1", "e2"],
            size=2,
        )
        assert c.level == 1
        assert c.parent == "c0"


class TestGraphCommunityReport:
    def test_create(self):
        r = GraphCommunityReport(
            id="cr1",
            community_id="c1",
            summary="Community summary",
            full_content="Full report content here",
            rank=2.0,
            size=5,
        )
        assert r.summary == "Community summary"
        assert r.size == 5


class TestGraphTextUnit:
    def test_create(self):
        tu = GraphTextUnit(
            id="tu1",
            text="Sample paper text",
            paper_id="p1",
            chunk_index=0,
        )
        assert tu.paper_id == "p1"
        assert tu.chunk_index == 0


# ═══════════════════════════════════════════════════════════════════
# KnowledgeGraph
# ═══════════════════════════════════════════════════════════════════


class TestKnowledgeGraph:
    def test_empty(self):
        kg = KnowledgeGraph()
        assert kg.stats() == {
            "entities": 0,
            "relationships": 0,
            "communities": 0,
            "community_reports": 0,
            "text_units": 0,
        }

    def test_add_entity(self):
        kg = KnowledgeGraph()
        e = GraphEntity(id="e1", title="TEST")
        kg.add_entity(e)
        assert "e1" in kg.entities

    def test_get_entity_by_title(self):
        kg = KnowledgeGraph()
        kg.add_entity(GraphEntity(id="e1", title="TRANSFORMER"))
        kg.add_entity(GraphEntity(id="e2", title="CNN"))
        found = kg.get_entity_by_title("transformer")
        assert found is not None
        assert found.id == "e1"

    def test_get_entity_by_title_case_insensitive(self):
        kg = KnowledgeGraph()
        kg.add_entity(GraphEntity(id="e1", title="TRANSFORMER"))
        found = kg.get_entity_by_title("Transformer")
        assert found is not None

    def test_get_relationships_for_entity(self):
        kg = KnowledgeGraph()
        kg.add_entity(GraphEntity(id="e1", title="A"))
        kg.add_entity(GraphEntity(id="e2", title="B"))
        r = GraphRelationship(id="r1", source="A", target="B", weight=1.0)
        kg.add_relationship(r)
        rels = kg.get_relationships_for_entity("A")
        assert len(rels) == 1
        assert rels[0].target == "B"

    def test_get_neighbor_entities(self):
        kg = KnowledgeGraph()
        kg.add_entity(GraphEntity(id="e1", title="A"))
        kg.add_entity(GraphEntity(id="e2", title="B"))
        kg.add_entity(GraphEntity(id="e3", title="C"))
        kg.add_relationship(GraphRelationship(id="r1", source="A", target="B"))
        kg.add_relationship(GraphRelationship(id="r2", source="A", target="C"))
        neighbors = kg.get_neighbor_entities("A")
        assert len(neighbors) == 2
        assert {n.title for n in neighbors} == {"B", "C"}

    def test_clear(self):
        kg = KnowledgeGraph()
        kg.add_entity(GraphEntity(id="e1", title="T"))
        kg.clear()
        assert len(kg.entities) == 0


# ═══════════════════════════════════════════════════════════════════
# GraphStore (Persistence)
# ═══════════════════════════════════════════════════════════════════


class TestGraphStore:
    @pytest.fixture
    def tmp_path(self):
        with tempfile.TemporaryDirectory() as d:
            yield Path(d)

    def test_save_and_load_empty(self, tmp_path):
        path = tmp_path / "graph.json"
        store = GraphStore(path=path)
        store.save()
        assert path.exists()

        store2 = GraphStore(path=path)
        store2.load()
        assert store2.graph.stats()["entities"] == 0

    def test_save_and_load_with_data(self, tmp_path):
        path = tmp_path / "graph.json"
        store = GraphStore(path=path)
        store.graph.add_entity(GraphEntity(id="e1", title="A"))
        store.graph.add_relationship(GraphRelationship(id="r1", source="A", target="B"))
        store.save()

        store2 = GraphStore(path=path)
        store2.load()
        assert "e1" in store2.graph.entities
        assert store2.graph.entities["e1"].title == "A"
        assert "r1" in store2.graph.relationships

    def test_clear_all(self, tmp_path):
        path = tmp_path / "graph.json"
        store = GraphStore(path=path)
        store.graph.add_entity(GraphEntity(id="e1", title="A"))
        store.save()
        store.clear_all()
        assert store.graph.stats()["entities"] == 0
        # Verify persistence cleared
        store2 = GraphStore(path=path)
        store2.load()
        assert store2.graph.stats()["entities"] == 0

    def test_json_serialization_complex_fields(self, tmp_path):
        """Verify that embedding vectors and other complex fields survive round-trip."""
        path = tmp_path / "graph.json"
        store = GraphStore(path=path)
        store.graph.add_entity(
            GraphEntity(
                id="e1",
                title="EMBEDDED",
                description_embedding=[0.1, 0.2, 0.3, 0.4],
                community_ids=["c1", "c2"],
            )
        )
        store.save()

        raw = json.loads(path.read_text(encoding="utf-8"))
        assert len(raw["entities"]) == 1
        assert raw["entities"][0]["description_embedding"] == [0.1, 0.2, 0.3, 0.4]

        store2 = GraphStore(path=path)
        store2.load()
        e = store2.graph.entities["e1"]
        assert e.description_embedding == [0.1, 0.2, 0.3, 0.4]
        assert e.community_ids == ["c1", "c2"]


# ═══════════════════════════════════════════════════════════════════
# Extractor — parsing only (no LLM)
# ═══════════════════════════════════════════════════════════════════


class TestExtractorParsing:
    def _parse(self, text: str, source_id: str = "src1"):
        """Helper to parse raw LLM output."""
        from graph.extractor import _parse_extraction_result

        entities, relationships = _parse_extraction_result(text, source_id)
        return entities, relationships

    def test_parse_empty(self):
        e, r = self._parse("")
        assert e == []
        assert r == []

    def test_parse_single_entity(self):
        text = '("entity"<|>TRANSFORMER<|>MODEL<|>A neural network)'
        e, r = self._parse(text)
        assert len(e) == 1
        assert e[0]["title"] == "TRANSFORMER"
        assert e[0]["type"] == "MODEL"
        assert r == []

    def test_parse_single_relationship(self):
        text = '("relationship"<|>A<|>B<|>Related to<|>0.8)'
        e, r = self._parse(text)
        assert e == []
        assert len(r) == 1
        assert r[0]["source"] == "A"
        assert r[0]["target"] == "B"
        assert r[0]["weight"] == 0.8

    def test_parse_multiple_records(self):
        text = (
            '("entity"<|>A<|>CONCEPT<|>Description A)\n'
            "##\n"
            '("entity"<|>B<|>CONCEPT<|>Description B)\n'
            "##\n"
            '("relationship"<|>A<|>B<|>Connected<|>1.0)\n'
            "##\n"
            "<|COMPLETE|>"
        )
        e, r = self._parse(text)
        assert len(e) == 2
        assert len(r) == 1

    def test_parse_malformed_skipped(self):
        text = "garbage text\n##\n("
        e, r = self._parse(text)
        assert e == []
        assert r == []

    def test_parse_weight_fallback(self):
        text = '("relationship"<|>A<|>B<|>Desc<|>not_a_number)'
        e, r = self._parse(text)
        assert r[0]["weight"] == 1.0  # fallback

    def test_deduplicate_entities(self):
        from graph.extractor import _deduplicate_entities

        raw = [
            {"title": "A", "type": "CONCEPT", "description": "First desc", "source_id": "s1"},
            {"title": "A", "type": "CONCEPT", "description": "Second desc", "source_id": "s2"},
        ]
        merged = _deduplicate_entities(raw)
        assert len(merged) == 1
        assert "Second desc" in merged[0]["description"]

    def test_deduplicate_relationships(self):
        from graph.extractor import _deduplicate_relationships

        raw = [
            {"source": "A", "target": "B", "weight": 1.0},
            {"source": "A", "target": "B", "weight": 2.0},  # duplicate
            {"source": "B", "target": "A", "weight": 3.0},  # reverse, should be deduped
        ]
        deduped = _deduplicate_relationships(raw)
        assert len(deduped) == 1
        assert deduped[0]["weight"] == 1.0  # first occurrence kept


# ═══════════════════════════════════════════════════════════════════
# Local Search — context building
# ═══════════════════════════════════════════════════════════════════


class TestLocalSearch:
    @pytest.fixture
    def graph(self):
        kg = KnowledgeGraph()
        kg.add_entity(
            GraphEntity(id="e1", title="TRANSFORMER", type="MODEL", description="A neural network using attention")
        )
        kg.add_entity(GraphEntity(id="e2", title="CNN", type="MODEL", description="Convolutional neural network"))
        kg.add_entity(GraphEntity(id="e3", title="ATTENTION", type="CONCEPT", description="Attention mechanism"))
        kg.add_entity(
            GraphEntity(id="e4", title="IMAGE NET", type="DATASET", description="Image classification dataset")
        )
        kg.add_relationship(
            GraphRelationship(
                id="r1", source="TRANSFORMER", target="ATTENTION", weight=0.95, description="Uses attention"
            )
        )
        kg.add_relationship(
            GraphRelationship(id="r2", source="CNN", target="IMAGE NET", weight=0.8, description="Trained on")
        )
        return kg

    def test_build_context_no_match(self, graph):
        from graph.local_search import build_local_context

        ctx = build_local_context("unrelated topic", graph, top_k_entities=5)
        assert ctx == ""  # no keyword match

    def test_build_context_keyword_match_title(self, graph):
        from graph.local_search import build_local_context

        ctx = build_local_context("transformer", graph, top_k_entities=5)
        assert "TRANSFORMER" in ctx
        assert "ATTENTION" in ctx  # neighbor

    def test_build_context_keyword_match_description(self, graph):
        from graph.local_search import build_local_context

        ctx = build_local_context("attention", graph, top_k_entities=5)
        assert "ATTENTION" in ctx
        assert "TRANSFORMER" in ctx  # linked entity

    def test_build_context_includes_relationships(self, graph):
        from graph.local_search import build_local_context

        ctx = build_local_context("transformer", graph, top_k_entities=5)
        assert "→" in ctx
        assert "Uses attention" in ctx

    def test_build_context_no_entities_returns_empty(self):
        from graph.local_search import build_local_context

        kg = KnowledgeGraph()
        ctx = build_local_context("anything", kg)
        assert ctx == ""


# ═══════════════════════════════════════════════════════════════════
# Cluster — community detection
# ═══════════════════════════════════════════════════════════════════


class TestCluster:
    def test_empty_graph_returns_empty(self):
        from graph.cluster import detect_communities

        communities = detect_communities({}, {})
        assert communities == []

    def test_small_graph_returns_communities(self):
        from graph.cluster import detect_communities

        entities = {
            "e1": GraphEntity(id="e1", title="A"),
            "e2": GraphEntity(id="e2", title="B"),
            "e3": GraphEntity(id="e3", title="C"),
        }
        relationships = {
            "r1": GraphRelationship(id="r1", source="A", target="B", weight=1.0),
            "r2": GraphRelationship(id="r2", source="B", target="C", weight=1.0),
        }
        communities = detect_communities(entities, relationships)
        # Should have at least one community
        assert len(communities) >= 1
        assert all(isinstance(c, GraphCommunity) for c in communities)
        # Communities should reference entity IDs
        all_eids = {eid for c in communities for eid in (c.entity_ids or [])}
        assert len(all_eids) > 0


# ═══════════════════════════════════════════════════════════════════
# Router — endpoint schemas
# ═══════════════════════════════════════════════════════════════════


class TestRouterSchemas:
    def test_graph_build_request(self):
        from graph.router import GraphBuildRequest

        req = GraphBuildRequest(paper_ids=["p1", "p2"])
        assert req.paper_ids == ["p1", "p2"]
        assert req.max_gleanings == 2
        assert req.entity_types is None

    def test_graph_query_request(self):
        from graph.router import GraphQuery

        req = GraphQuery(query="test query", strategy="local")
        assert req.query == "test query"
        assert req.strategy == "local"
        assert req.top_k_entities == 10

    def test_graph_query_invalid_strategy(self):
        from graph.router import GraphQuery

        req = GraphQuery(query="test", strategy="invalid")
        assert req.strategy == "invalid"  # validation happens at endpoint

    def test_graph_stats_response(self):
        from graph.router import GraphStatsResponse

        resp = GraphStatsResponse(
            entities=10,
            relationships=5,
            communities=2,
            community_reports=2,
            text_units=8,
        )
        assert resp.entities == 10
        assert resp.communities == 2

    def test_entity_response(self):
        from graph.router import EntityResponse

        resp = EntityResponse(
            id="e1",
            title="TEST",
            type="CONCEPT",
            description="A test entity",
            rank=1.0,
            community_ids=["c1"],
            relationships=[{"source": "A", "target": "B", "weight": 1.0}],
        )
        assert resp.title == "TEST"
        assert len(resp.relationships) == 1
