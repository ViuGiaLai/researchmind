"""Cloud embedding via Google Gemini Embedding API.

Gemini gemini-embedding-001 (free tier, 768-dim).
No local model — keeps app size small.
"""

from typing import Optional
import hashlib
import json
import time

from loguru import logger
from config.settings import settings


class Embedder:
    def __init__(self, model_name: str = "gemini-embedding-001"):
        self.model_name = model_name
        self._cloud_dim: Optional[int] = None

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        from app_state import state
        from db.database import get_session
        from db.models import EmbeddingCache

        mode_prefix = f"mode:cloud|model:{self.model_name}|"

        hashes = []
        hash_to_text = {}
        for idx, text in enumerate(texts):
            raw_key = f"{mode_prefix}{text}"
            h = hashlib.md5(raw_key.encode("utf-8")).hexdigest()
            hashes.append(h)
            hash_to_text[h] = text

        unique_hashes = list(set(hashes))
        cached_embeddings = {}
        uncached_hashes = []

        if state.engine:
            session = get_session(state.engine)
            try:
                db_results = session.query(EmbeddingCache).filter(EmbeddingCache.key_hash.in_(unique_hashes)).all()
                for row in db_results:
                    cached_embeddings[row.key_hash] = json.loads(row.vector)
            except Exception as cache_err:
                logger.warning(f"Failed to query embedding cache: {cache_err}")
            finally:
                session.close()

        for h in unique_hashes:
            if h not in cached_embeddings:
                uncached_hashes.append(h)

        if uncached_hashes:
            uncached_texts = [hash_to_text[h] for h in uncached_hashes]
            new_embeddings = self._embed_gemini(uncached_texts)

            if state.engine:
                session = get_session(state.engine)
                try:
                    for h, emb in zip(uncached_hashes, new_embeddings):
                        cached_embeddings[h] = emb
                        exists = session.query(EmbeddingCache).filter(EmbeddingCache.key_hash == h).first()
                        if not exists:
                            session.add(EmbeddingCache(
                                key_hash=h,
                                vector=json.dumps(emb)
                            ))
                    session.commit()
                except Exception as save_err:
                    session.rollback()
                    logger.warning(f"Failed to save to embedding cache: {save_err}")
                finally:
                    session.close()
            else:
                for h, emb in zip(uncached_hashes, new_embeddings):
                    cached_embeddings[h] = emb

        results = [None] * len(texts)
        for idx, h in enumerate(hashes):
            results[idx] = cached_embeddings[h]

        return results

    def embed_query(self, query: str) -> list[float]:
        return self.embed([query])[0]

    def _embed_gemini(self, texts: list[str]) -> list[list[float]]:
        import httpx
        from common.request_context import get_request_bearer_token

        gateway_url = getattr(settings, "researchmind_cloud_url", "").rstrip("/")
        if gateway_url:
            token = get_request_bearer_token() or getattr(settings, "researchmind_cloud_token", "")
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = httpx.post(
                f"{gateway_url}/v1/embeddings", headers=headers,
                json={"texts": texts, "model": self.model_name},
                timeout=getattr(settings, "researchmind_cloud_timeout", 120.0),
            )
            response.raise_for_status()
            embeddings = response.json().get("embeddings", [])
            if embeddings and self._cloud_dim is None:
                self._cloud_dim = len(embeddings[0])
            return embeddings

        api_key = settings.gemini_api_key
        if not api_key:
            raise RuntimeError(
                "Gemini API key not configured. Set GEMINI_API_KEY in .env or use EMBEDDING_MODE=local"
            )

        results = []
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i : i + batch_size]
            requests_payload = [
                {
                    "model": f"models/{self.model_name}",
                    "content": {"parts": [{"text": text}]},
                }
                for text in batch_texts
            ]
            resp = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:batchEmbedContents",
                params={"key": api_key},
                json={"requests": requests_payload},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            embeddings_data = data.get("embeddings", [])
            for emb_item in embeddings_data:
                embedding = emb_item.get("values", [])
                if self._cloud_dim is None and embedding:
                    self._cloud_dim = len(embedding)
                    logger.info(f"Cloud embedding dimension: {self._cloud_dim}")
                results.append(embedding)
        return results

    @property
    def dimension(self) -> int:
        return self._cloud_dim or 768  # fallback until first API call

    def _ensure_api_key(self) -> None:
        """Placeholder — kept for API compatibility with upstream callers."""
        pass


_embedder: Optional[Embedder] = None


def get_embedder(model_name: str = "gemini-embedding-001") -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder(model_name)
    return _embedder
