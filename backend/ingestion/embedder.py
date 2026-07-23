"""Hybrid embedding: cloud (Gemini API / gateway) or local (sentence-transformers).

Fallback chain: gateway → Gemini API → local sentence-transformers → zeros.
"""

import hashlib
import json
import time

from loguru import logger

from config.settings import settings


class Embedder:
    def __init__(self, model_name: str = "gemini-embedding-001", embedding_mode: str = "cloud"):
        self.model_name = model_name
        self.embedding_mode = embedding_mode
        self._cloud_dim: int | None = None
        self._local_model = None
        self._local_dim: int = 1024

    def _ensure_local_model(self):
        if self._local_model is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer
            local_name = getattr(settings, "embedding_model", "BAAI/bge-m3")
            self._local_model = SentenceTransformer(local_name, device="cpu")
            dim = self._local_model.get_sentence_embedding_dimension()
            if dim:
                self._local_dim = dim
            logger.info(f"Local embedding model ready: {local_name} (dim={self._local_dim})")
        except ImportError:
            logger.warning("sentence-transformers not installed — local embedding unavailable")
            raise
        except Exception as e:
            logger.error(f"Failed to load local embedding model: {e}")
            raise

    def _embed_local(self, texts: list[str]) -> list[list[float]]:
        self._ensure_local_model()
        import numpy as np
        embeddings = self._local_model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
        if isinstance(embeddings, np.ndarray):
            return embeddings.tolist()
        return embeddings

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        if self.embedding_mode == "local":
            try:
                return self._embed_local(texts)
            except Exception as e:
                logger.error(f"Local embedding failed: {e}")
                return [[0.0] * self.dimension for _ in texts]

        from app_state import state
        from db.database import get_session
        from db.models import EmbeddingCache

        mode_prefix = f"mode:{self.embedding_mode}|model:{self.model_name}|"

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

    def _call_gateway(self, gateway_url: str, texts: list[str]) -> list[list[float]]:
        import httpx

        from common.request_context import get_request_bearer_token

        shared = getattr(settings, "researchmind_cloud_token", "")
        user_token = get_request_bearer_token()
        if shared:
            headers = {"Authorization": f"Bearer {shared}"}
            if user_token:
                headers["X-User-Token"] = user_token
        elif user_token:
            headers = {"Authorization": f"Bearer {user_token}"}
        else:
            headers = {}
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

    def _call_gateway_with_retry(self, gateway_url: str, texts: list[str], max_retries: int = 3) -> list[list[float]]:
        import httpx
        for attempt in range(max_retries):
            try:
                return self._call_gateway(gateway_url, texts)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429 and attempt < max_retries - 1:
                    wait = 2 ** (attempt + 1)
                    logger.warning(f"Gateway 429, retry {attempt + 1}/{max_retries} after {wait}s")
                    time.sleep(wait)
                else:
                    raise
        raise RuntimeError(f"Gateway still rate-limited after {max_retries} retries")

    def _embed_gemini(self, texts: list[str]) -> list[list[float]]:
        import httpx

        gateway_url = getattr(settings, "researchmind_cloud_url", "").rstrip("/")
        if gateway_url:
            try:
                return self._call_gateway_with_retry(gateway_url, texts)
            except Exception as exc:
                logger.warning(f"Gateway failed after retries: {exc}")

        api_key = settings.gemini_api_key
        if not api_key:
            logger.warning(
                "Gemini API key not configured — trying local embedding fallback. "
                "Set GEMINI_API_KEY in .env or use EMBEDDING_MODE=local"
            )
            try:
                return self._embed_local(texts)
            except Exception as local_err:
                logger.error(f"Local embedding fallback also failed: {local_err}")
                return [[0.0] * self.dimension for _ in texts]

        try:
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
        except Exception as exc:
            logger.warning(f"Direct Gemini API failed: {exc} — trying local fallback")
            try:
                return self._embed_local(texts)
            except Exception as local_err:
                logger.error(f"Local fallback also failed: {local_err}")
                return [[0.0] * self.dimension for _ in texts]

    @property
    def dimension(self) -> int:
        if self.embedding_mode == "local":
            return self._local_dim
        return self._cloud_dim or 768  # fallback until first API call


_embedder: Embedder | None = None


def get_embedder(model_name: str = "gemini-embedding-001", embedding_mode: str = "cloud") -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder(model_name, embedding_mode)
    return _embedder
