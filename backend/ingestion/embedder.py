"""Embedding generation using bge-m3 via sentence-transformers.

bge-m3 is a multi-lingual embedding model supporting 100+ languages
including Vietnamese. It generates 1024-dimension dense vectors.
"""

from typing import Optional
import numpy as np
from loguru import logger


class Embedder:
    """Wrapper around bge-m3 for generating text embeddings."""

    def __init__(self, model_name: str = "BAAI/bge-m3"):
        self.model_name = model_name
        self._model = None

    def _load_model(self):
        """Lazy-load the model on first use."""
        if self._model is not None:
            return

        logger.info(f"Loading embedding model: {self.model_name}")
        from sentence_transformers import SentenceTransformer
        self._model = SentenceTransformer(
            self.model_name,
            model_kwargs={"low_cpu_mem_usage": False}
        )
        logger.info(f"Model loaded. Embedding dimension: {self._model.get_sentence_embedding_dimension()}")

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed.

        Returns:
            List of embedding vectors, each as a list of floats.
        """
        if not texts:
            return []

        self._load_model()

        # bge-m3 performs best when input is prefixed for retrieval tasks
        prefixed = [f"Represent this sentence for searching relevant passages: {t}" for t in texts]

        embeddings = self._model.encode(
            prefixed,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        """
        Generate embedding for a search query.

        Args:
            query: Search query string.

        Returns:
            Single embedding vector as a list of floats.
        """
        self._load_model()

        # Query instruction for bge-m3
        prefixed = f"Represent this sentence for searching relevant passages: {query}"

        embedding = self._model.encode(
            prefixed,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        return embedding.tolist()

    @property
    def dimension(self) -> int:
        """Get the embedding dimension."""
        self._load_model()
        return self._model.get_sentence_embedding_dimension()


# Singleton instance
_embedder: Optional[Embedder] = None


def get_embedder(model_name: str = "BAAI/bge-m3") -> Embedder:
    """Get or create the singleton embedder instance."""
    global _embedder
    if _embedder is None:
        _embedder = Embedder(model_name)
    return _embedder
