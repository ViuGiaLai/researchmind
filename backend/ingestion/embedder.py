"""Embedding generation: local (sentence-transformers) or cloud (Gemini Embedding).

Local: bge-m3 via sentence-transformers (multilingual, 1024-dim).
Cloud: Google Gemini embedding API (gemini-embedding-001, free tier).
"""

from typing import Optional
import numpy as np
from loguru import logger
from config.settings import settings
import time
import threading


class Embedder:
    def __init__(self, model_name: str = "BAAI/bge-m3"):
        self.model_name = model_name
        self._model = None
        self._mode = settings.embedding_mode
        self._cloud_dim: Optional[int] = None  # detected dynamically from API
        self.last_used = time.time()
        self._start_unload_thread()

    def _start_unload_thread(self):
        def check_idle():
            while True:
                time.sleep(60)
                if self._model is not None and self._model != "cloud" and time.time() - self.last_used > 300:
                    logger.info("Power Saver Mode: Unloading local embedding model to free RAM")
                    self._model = None
                    import gc
                    import torch
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
        t = threading.Thread(target=check_idle, daemon=True)
        t.start()

    def _load_model(self):
        self.last_used = time.time()
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
        import os
        
        # Optimize PyTorch CPU inference threads to prevent CPU thrashing
        if not torch.cuda.is_available():
            num_cores = os.cpu_count() or 4
            torch.set_num_threads(max(1, min(4, num_cores // 2)))
            logger.info(f"PyTorch CPU threads set to {torch.get_num_threads()}")

        self._model = SentenceTransformer(
            self.model_name,
            model_kwargs={"low_cpu_mem_usage": False, "trust_remote_code": True},
            device="cpu" if not torch.cuda.is_available() else "cuda",
        )
        logger.info(f"Local model loaded. Dimension: {self._model.get_sentence_embedding_dimension()}")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        
        import hashlib
        import json
        from app_state import state
        from db.database import get_session
        from db.models import EmbeddingCache

        mode_prefix = f"mode:{self._mode}|model:{self.model_name}|"
        
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
            new_embeddings = self._embed_uncached(uncached_texts)
            
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

    def _embed_uncached(self, texts: list[str]) -> list[list[float]]:
        self._load_model()
        if self._mode == "cloud":
            return self._embed_gemini(texts)
        prefixed = [f"Represent this sentence for searching relevant passages: {t}" for t in texts]
        embeddings = self._model.encode(prefixed, normalize_embeddings=True, show_progress_bar=False)
        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        return self.embed([query])[0]

    def _embed_gemini(self, texts: list[str]) -> list[list[float]]:
        import httpx
        api_key = settings.gemini_api_key
        results = []
        try:
            # Batch requests in chunks of 100 (Gemini API limit)
            batch_size = 100
            for i in range(0, len(texts), batch_size):
                batch_texts = texts[i : i + batch_size]
                requests_payload = [
                    {
                        "model": "models/gemini-embedding-001",
                        "content": {"parts": [{"text": text}]},
                    }
                    for text in batch_texts
                ]
                resp = httpx.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
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
