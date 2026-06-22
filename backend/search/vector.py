"""Vector search using ChromaDB — with MMR diversity (paper-qa inspired).

MMR (Maximal Marginal Relevance) balances relevance against diversity:
    MMR = argmax [ λ * sim(q, d_i) - (1-λ) * max_{j in selected} sim(d_i, d_j) ]

MIT License — adapted from paper-qa:
https://github.com/Future-House/paper-qa/blob/main/src/paperqa/llms.py
"""

import os

# Disable ChromaDB telemetry before importing chromadb
os.environ["ANONYMIZED_TELEMETRY"] = "False"

from typing import Optional
from dataclasses import dataclass
from pathlib import Path
from loguru import logger
import numpy as np


def _patch_chromadb_telemetry():
    """Monkey-patch chromadb telemetry to suppress posthog version errors."""
    try:
        import chromadb.telemetry.product.posthog
        chromadb.telemetry.product.posthog.Posthog.capture = lambda self, event: None
    except Exception:
        pass


@dataclass
class VectorResult:
    chunk_id: str
    paper_id: str
    paper_title: str
    chunk_index: int
    content: str
    page_number: Optional[int]
    score: float


class VectorSearch:
    """Vector search engine backed by ChromaDB."""

    def __init__(self, persist_dir: Path):
        self.persist_dir = persist_dir
        self._client = None
        self._collection = None

    def _ensure_client(self):
        """Lazy-init ChromaDB client."""
        if self._client is not None:
            return

        import chromadb
        _patch_chromadb_telemetry()
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(self.persist_dir))
        logger.info(f"ChromaDB client initialized at: {self.persist_dir}")

    @property
    def collection(self):
        """Get or create the chunks collection."""
        self._ensure_client()
        if self._collection is None:
            try:
                self._collection = self._client.get_collection("paper_chunks")
            except Exception:
                self._collection = self._client.create_collection(
                    name="paper_chunks",
                    metadata={"hnsw:space": "cosine"},
                )
                logger.info("Created ChromaDB collection: paper_chunks")
        return self._collection

    def add_chunks(
        self,
        chunk_ids: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        documents: list[str],
    ):
        """Add chunks with embeddings to ChromaDB."""
        if not chunk_ids:
            return

        self.collection.add(
            ids=chunk_ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents,
        )
        logger.debug(f"Added {len(chunk_ids)} chunks to ChromaDB")

    def search(
        self,
        query_embedding: list[float],
        paper_ids: Optional[list[str]] = None,
        top_k: int = 20,
        mmr_lambda: Optional[float] = None,
    ) -> list[VectorResult]:
        """
        Search for similar chunks using vector similarity.

        When mmr_lambda is set (0.0–1.0), applies MMR diversity re-ranking
        over a larger candidate pool (fetch_k = top_k × 3).
            λ = 1.0  → pure relevance (no diversity)
            λ = 0.7  → balanced (paper-qa default)
            λ = 0.0  → pure diversity

        Args:
            query_embedding: The query embedding vector.
            paper_ids: Optional filter to specific papers.
            top_k: Number of results to return.
            mmr_lambda: MMR diversity parameter. None = standard search.

        Returns:
            List of VectorResult sorted by score (descending), or MMR-ordered.
        """
        where_filter = None
        if paper_ids:
            where_filter = {"paper_id": {"$in": paper_ids}}

        fetch_k = top_k * 3 if mmr_lambda is not None else top_k

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_k,
            where=where_filter,
            include=["metadatas", "documents", "distances"],
        )

        if not results["ids"] or not results["ids"][0]:
            return []

        vector_results = []
        for i in range(len(results["ids"][0])):
            chunk_id = results["ids"][0][i]
            metadata = results["metadatas"][0][i]
            document = results["documents"][0][i]
            distance = results["distances"][0][i]
            similarity = 1.0 - distance

            vector_results.append(VectorResult(
                chunk_id=chunk_id,
                paper_id=metadata.get("paper_id", ""),
                paper_title=metadata.get("paper_title", ""),
                chunk_index=int(metadata.get("chunk_index", 0)),
                content=document,
                page_number=metadata.get("page_number"),
                score=similarity,
            ))

        if mmr_lambda is not None and len(vector_results) > 0:
            vector_results = self._mmr_rerank(vector_results, query_embedding, mmr_lambda)

        return vector_results

    def _mmr_rerank(
        self,
        candidates: list[VectorResult],
        query_embedding: list[float],
        mmr_lambda: float,
    ) -> list[VectorResult]:
        """
        Re-rank candidates using Maximal Marginal Relevance.

        Iteratively selects items that maximise:
            λ × relevance(q, d_i) - (1 - λ) × max_{j ∈ S} similarity(d_i, d_j)
        """
        if not candidates:
            return candidates

        query_emb = np.array(query_embedding, dtype=np.float32)

        # Build embedding matrix for all candidates
        emb_list = []
        for c in candidates:
            emb_list.append(self._get_embedding(c.chunk_id, query_emb.shape[0]))
        emb_matrix = np.array(emb_list, dtype=np.float32)  # (N, D)

        # Normalise rows — already normalised in embedder, but be safe
        norms = np.linalg.norm(emb_matrix, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        emb_matrix = emb_matrix / norms

        # Relevance scores = cosine similarity to query
        query_norm = np.linalg.norm(query_emb)
        if query_norm > 0:
            query_emb = query_emb / query_norm
        relevance = emb_matrix @ query_emb  # (N,)

        # Pairwise cosine similarity matrix (N, N)
        sim_matrix = emb_matrix @ emb_matrix.T  # (N, N)
        np.fill_diagonal(sim_matrix, -1.0)  # ignore self-similarity

        n = len(candidates)
        selected = []
        remaining = list(range(n))

        for _ in range(min(n, len(candidates))):
            best_score = -1e9
            best_idx = -1

            for i in remaining:
                # marginal relevance score
                div_penalty = sim_matrix[i, selected].max() if selected else 0.0
                mmr_score = mmr_lambda * relevance[i] - (1.0 - mmr_lambda) * div_penalty

                if mmr_score > best_score:
                    best_score = mmr_score
                    best_idx = i

            selected.append(best_idx)
            remaining.remove(best_idx)

        return [candidates[i] for i in selected]

    def _get_embedding(self, chunk_id: str, dim: int) -> np.ndarray:
        """Retrieve a stored embedding from ChromaDB for MMR computation."""
        try:
            result = self.collection.get(
                ids=[chunk_id],
                include=["embeddings"],
            )
            if result["embeddings"] and result["embeddings"][0]:
                return np.array(result["embeddings"][0], dtype=np.float32)
        except Exception:
            pass
        return np.zeros(dim, dtype=np.float32)

    def delete_paper_chunks(self, paper_id: str):
        """Delete all chunks for a given paper."""
        self.collection.delete(where={"paper_id": paper_id})
        logger.info(f"Deleted chunks for paper: {paper_id}")

    def clear_collection(self):
        """Delete and recreate the collection to clear all data."""
        self._ensure_client()
        try:
            self._client.delete_collection("paper_chunks")
            logger.info("Deleted ChromaDB collection 'paper_chunks' for reset")
        except Exception as e:
            logger.warning(f"ChromaDB collection deletion failed or collection not found: {e}")
        # Recreate collection immediately to avoid stale cache issues
        try:
            self._collection = self._client.create_collection(
                name="paper_chunks",
                metadata={"hnsw:space": "cosine"},
            )
            logger.info("Recreated ChromaDB collection 'paper_chunks'")
        except Exception as e:
            logger.error(f"Failed to recreate ChromaDB collection: {e}")
            self._collection = None

    def count(self) -> int:
        """Get total number of chunks in the collection."""
        return self.collection.count()
