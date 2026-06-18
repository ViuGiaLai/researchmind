"""Embedding generation: local (sentence-transformers) or cloud (Gemini Embedding).

Local: bge-m3 via sentence-transformers (multilingual, 1024-dim).
Cloud: Google Gemini embedding API (gemini-embedding-001, free tier).
"""

from typing import Optional
import numpy as np
from loguru import logger
from config.settings import settings


class Embedder:
    def __init__(self, model_name: str = "BAAI/bge-m3"):
        self.model_name = model_name
        self._model = None
        self._mode = settings.embedding_mode
        self._cloud_dim: Optional[int] = None  # detected dynamically from API

    def _load_model(self):
        if self._model is not None:
            return
        if self._mode == "cloud":
            api_key = settings.gemini_api_key
            if not api_key:
                logger.warning("Cloud embedding: no Gemini API key, falling back to local")
                self._mode = "local"
            else:
                logger.info("Cloud embedding: Gemini gemini-embedding-001")
                self._model = "cloud"
                return
        logger.info(f"Loading local embedding model: {self.model_name}")
        from sentence_transformers import SentenceTransformer
        import torch
        self._model = SentenceTransformer(
            self.model_name,
            model_kwargs={"low_cpu_mem_usage": False, "trust_remote_code": True},
            device="cpu" if not torch.cuda.is_available() else "cuda",
        )
        logger.info(f"Local model loaded. Dimension: {self._model.get_sentence_embedding_dimension()}")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        self._load_model()
        if self._model == "cloud":
            return self._embed_gemini(texts)
        prefixed = [f"Represent this sentence for searching relevant passages: {t}" for t in texts]
        embeddings = self._model.encode(prefixed, normalize_embeddings=True, show_progress_bar=False)
        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        self._load_model()
        if self._model == "cloud":
            return self._embed_gemini([query])[0]
        prefixed = f"Represent this sentence for searching relevant passages: {query}"
        embedding = self._model.encode(prefixed, normalize_embeddings=True, show_progress_bar=False)
        return embedding.tolist()

    def _embed_gemini(self, texts: list[str]) -> list[list[float]]:
        import httpx
        api_key = settings.gemini_api_key
        results = []
        try:
            for text in texts:
                resp = httpx.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
                    params={"key": api_key},
                    json={
                        "model": "models/gemini-embedding-001",
                        "content": {"parts": [{"text": text}]},
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                embedding = data.get("embedding", {}).get("values", [])
                # Detect dimension from first successful API response
                if self._cloud_dim is None and embedding:
                    self._cloud_dim = len(embedding)
                    logger.info(f"Cloud embedding dimension detected: {self._cloud_dim}")
                results.append(embedding)
            return results
        except Exception as e:
            logger.error(f"Gemini embedding failed: {e}, falling back to local")
            self._mode = "local"
            self._model = None
            self._load_model()
            return self.embed(texts)

    @property
    def dimension(self) -> int:
        self._load_model()
        if self._model == "cloud":
            return self._cloud_dim or 768  # fallback 768 if not yet detected
        return self._model.get_sentence_embedding_dimension()


_embedder: Optional[Embedder] = None


def get_embedder(model_name: str = "BAAI/bge-m3") -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder(model_name)
    return _embedder
