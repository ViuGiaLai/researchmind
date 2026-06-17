"""Vector search using ChromaDB."""

from typing import Optional
from dataclasses import dataclass
from pathlib import Path
from loguru import logger


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
    ) -> list[VectorResult]:
        """
        Search for similar chunks using vector similarity.

        Args:
            query_embedding: The query embedding vector.
            paper_ids: Optional filter to specific papers.
            top_k: Number of results to return.

        Returns:
            List of VectorResult sorted by cosine similarity (descending).
        """
        where_filter = None
        if paper_ids:
            where_filter = {"paper_id": {"$in": paper_ids}}

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
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

            # ChromaDB returns cosine distance, convert to similarity score
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

        return vector_results

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
