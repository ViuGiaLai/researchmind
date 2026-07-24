"""Tests for vector search — ChromaDB-backed VectorSearch with MMR re-ranking."""

from pathlib import Path

import pytest

from search.vector import VectorResult, VectorSearch


@pytest.fixture
def vector_search(tmp_path: Path) -> VectorSearch:
    """Create a VectorSearch with a temporary persistence directory."""
    return VectorSearch(persist_dir=tmp_path / "chroma_test")


@pytest.fixture
def sample_chunks(vector_search: VectorSearch) -> list[str]:
    """Add sample chunks to the vector search index."""
    chunk_ids = [f"chunk_{i}" for i in range(3)]
    embeddings = [
        [0.1, 0.2, 0.3, 0.4],   # chunk_0: generic
        [0.9, 0.8, 0.7, 0.6],   # chunk_1: similar to query
        [0.5, 0.5, 0.0, 0.0],   # chunk_2: different direction
    ]
    metadatas = [
        {"paper_id": "paper_1", "paper_title": "Test Paper", "chunk_index": 0, "page_number": 1},
        {"paper_id": "paper_1", "paper_title": "Test Paper", "chunk_index": 1, "page_number": 2},
        {"paper_id": "paper_2", "paper_title": "Another Paper", "chunk_index": 0, "page_number": 1},
    ]
    documents = [
        "Introduction to the method",
        "Detailed results and analysis",
        "Conclusion and future work",
    ]
    vector_search.add_chunks(chunk_ids, embeddings, metadatas, documents)
    return chunk_ids


class TestVectorSearchInitialization:
    def test_init_creates_directory(self, tmp_path: Path):
        """Persist directory is created on first access."""
        persist_dir = tmp_path / "new_chroma"
        vs = VectorSearch(persist_dir=persist_dir)
        # Access collection to trigger lazy init
        _ = vs.collection
        assert persist_dir.exists()

    def test_count_empty(self, tmp_path: Path):
        """Count returns 0 for empty collection."""
        vs = VectorSearch(persist_dir=tmp_path / "empty_chroma")
        assert vs.count() == 0

    def test_collection_name(self, vector_search: VectorSearch):
        """Collection is created with the correct name."""
        assert vector_search.collection.name == "paper_chunks"


class TestVectorSearchAddChunks:
    def test_add_chunks_increases_count(self, vector_search: VectorSearch):
        """Adding chunks increases the collection count."""
        vector_search.add_chunks(
            chunk_ids=["a1", "a2"],
            embeddings=[[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]],
            metadatas=[{"paper_id": "p1"}, {"paper_id": "p1"}],
            documents=["doc1", "doc2"],
        )
        assert vector_search.count() == 2

    def test_add_empty_chunks(self, vector_search: VectorSearch):
        """Adding empty chunk list does nothing."""
        vector_search.add_chunks(
            chunk_ids=[],
            embeddings=[],
            metadatas=[],
            documents=[],
        )
        assert vector_search.count() == 0

    def test_add_duplicate_ids(self, vector_search: VectorSearch):
        """Adding duplicate chunk IDs updates existing entries."""
        vector_search.add_chunks(
            chunk_ids=["dup1"],
            embeddings=[[0.1, 0.2, 0.3, 0.4]],
            metadatas=[{"paper_id": "p1"}],
            documents=["original"],
        )
        # ChromaDB upserts by default
        vector_search.add_chunks(
            chunk_ids=["dup1"],
            embeddings=[[0.1, 0.2, 0.3, 0.4]],
            metadatas=[{"paper_id": "p1"}],
            documents=["updated"],
        )
        assert vector_search.count() == 1


class TestVectorSearchSearch:
    def test_basic_search(self, vector_search: VectorSearch, sample_chunks: list[str]):
        """Basic vector search returns relevant results."""
        query_emb = [0.85, 0.75, 0.65, 0.55]  # closest to chunk_1
        results = vector_search.search(query_embedding=query_emb, top_k=2)
        assert len(results) <= 2
        assert all(isinstance(r, VectorResult) for r in results)

    def test_search_empty_collection(self, tmp_path: Path):
        """Search on empty collection returns empty list."""
        vs = VectorSearch(persist_dir=tmp_path / "empty_search")
        results = vs.search(query_embedding=[0.1, 0.2, 0.3, 0.4])
        assert results == []

    def test_search_with_paper_filter(self, vector_search: VectorSearch, sample_chunks: list[str]):
        """Filter search to specific paper IDs."""
        query_emb = [0.85, 0.75, 0.65, 0.55]
        results = vector_search.search(
            query_embedding=query_emb,
            paper_ids=["paper_1"],
            top_k=5,
        )
        # All results should be from paper_1
        assert all(r.paper_id == "paper_1" for r in results)

    def test_search_with_mmr(self, vector_search: VectorSearch, sample_chunks: list[str]):
        """MMR re-ranking returns diverse results."""
        query_emb = [0.85, 0.75, 0.65, 0.55]
        results = vector_search.search(
            query_embedding=query_emb,
            top_k=3,
            mmr_lambda=0.7,
        )
        assert len(results) > 0
        assert all(isinstance(r, VectorResult) for r in results)


class TestVectorResult:
    def test_vector_result_dataclass(self):
        """VectorResult stores and exposes fields correctly."""
        r = VectorResult(
            chunk_id="chunk_1",
            paper_id="paper_1",
            paper_title="Test",
            chunk_index=0,
            content="Some content",
            page_number=1,
            score=0.95,
        )
        assert r.chunk_id == "chunk_1"
        assert r.paper_id == "paper_1"
        assert r.score == 0.95

    def test_vector_result_none_page(self):
        """VectorResult allows None page_number."""
        r = VectorResult(
            chunk_id="c1",
            paper_id="p1",
            paper_title="T",
            chunk_index=0,
            content="C",
            page_number=None,
            score=0.5,
        )
        assert r.page_number is None


class TestVectorSearchDelete:
    def test_delete_paper_chunks(self, vector_search: VectorSearch, sample_chunks: list[str]):
        """Deleting chunks for a paper removes them."""
        before = vector_search.count()
        vector_search.delete_paper_chunks("paper_1")
        after = vector_search.count()
        assert after < before

    def test_clear_collection(self, vector_search: VectorSearch, sample_chunks: list[str]):
        """Clearing the collection resets it to empty."""
        assert vector_search.count() > 0
        vector_search.clear_collection()
        assert vector_search.count() == 0
