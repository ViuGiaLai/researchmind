import json

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import Setting
from chat.generator import Generator

router = APIRouter(prefix="/api", tags=["Settings"])


# ─── Settings ────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings():
    """Get all settings."""
    return {
        "llama_server_url": settings.llama_server_url,
        "local_model": settings.local_model,
        "local_max_tokens": settings.local_max_tokens,
        "llm_mode": settings.llm_mode,
        "claude_api_key": "***" if settings.claude_api_key else "",
        "claude_model": settings.claude_model,
        "deepseek_api_key": "***" if settings.deepseek_api_key else "",
        "deepseek_model": settings.deepseek_model,
        "gemini_api_key": "***" if settings.gemini_api_key else "",
        "gemini_model": settings.gemini_model,
        "groq_api_key": "***" if settings.groq_api_key else "",
        "groq_model": settings.groq_model,
        "nvidia_api_key": "***" if settings.nvidia_api_key else "",
        "nvidia_model": settings.nvidia_model,
        "freemodel_api_key": "***" if settings.freemodel_api_key else "",
        "freemodel_model": settings.freemodel_model,
        "custom_cloud_provider": settings.custom_cloud_provider,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k_retrieval": settings.top_k_retrieval,
        "embedding_model": settings.embedding_model,
        "embedding_mode": settings.embedding_mode,
        "setup_completed": settings.setup_completed,
        "zotero_data_dir": getattr(settings, "zotero_data_dir", ""),
        "enable_reranker": settings.enable_reranker,
    }


@router.put("/settings")
async def update_settings(new_settings: dict = Body(...)):
    """Update settings."""
    session = get_session(state.engine)
    try:
        for key, value in new_settings.items():
            if hasattr(settings, key):
                if key in ("claude_api_key", "deepseek_api_key", "gemini_api_key", "groq_api_key", "nvidia_api_key", "freemodel_api_key"):
                    if value == "***" or (not value and getattr(settings, key, None)):
                        continue
                setattr(settings, key, value)
                setting = session.query(Setting).filter(Setting.key == key).first()
                if setting:
                    setting.value = str(value)
                else:
                    session.add(Setting(key=key, value=str(value)))
        session.commit()

        if "embedding_mode" in new_settings:
            from ingestion.embedder import _embedder
            if _embedder is not None:
                _embedder._model = None
                _embedder._mode = settings.embedding_mode
                logger.info("Embedder reset: mode={}", settings.embedding_mode)

        state.generator = Generator(
            llama_server_url=settings.llama_server_url,
            local_model=settings.local_model,
            claude_api_key=settings.claude_api_key,
            claude_model=settings.claude_model,
            deepseek_api_key=settings.deepseek_api_key,
            deepseek_model=settings.deepseek_model,
            gemini_api_key=settings.gemini_api_key,
            gemini_model=settings.gemini_model,
            groq_api_key=settings.groq_api_key,
            groq_model=settings.groq_model,
            nvidia_api_key=settings.nvidia_api_key,
            nvidia_model=settings.nvidia_model,
            nvidia_url=getattr(settings, "nvidia_url", "https://integrate.api.nvidia.com/v1"),
            nvidia_deepseek_api_key=getattr(settings, "nvidia_deepseek_api_key", ""),
            nvidia_deepseek_model=getattr(settings, "nvidia_deepseek_model", "deepseek-ai/deepseek-v4-pro"),
            freemodel_api_key=settings.freemodel_api_key,
            freemodel_model=settings.freemodel_model,
            freemodel_url=getattr(settings, "freemodel_url", "https://freemodel.dev/v1"),
            mode=settings.llm_mode,
            custom_cloud_provider=settings.custom_cloud_provider,
            local_max_tokens=settings.local_max_tokens,
        )

        return {"status": "updated"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


# ─── Test Embedding Connection ────────────────────────────────────

@router.post("/settings/test-embedding")
async def test_embedding_connection():
    """Test Gemini Embedding API connection."""
    api_key = settings.gemini_api_key
    if not api_key:
        return {"success": False, "error": "Chưa có Gemini API Key. Vào mục Custom API Key để nhập."}

    import httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
                params={"key": api_key},
                json={
                    "model": "models/gemini-embedding-001",
                    "content": {"parts": [{"text": "test"}]},
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                embedding = data.get("embedding", {}).get("values", [])
                dim = len(embedding)
                return {"success": True, "dimension": dim, "message": f"Kết nối Gemini Embedding thành công! Dimension: {dim}"}
            else:
                try:
                    err = resp.json().get("error", {}).get("message", resp.text)
                except:
                    err = resp.text
                return {"success": False, "error": f"Gemini API lỗi: {err}"}
    except Exception as e:
        return {"success": False, "error": f"Lỗi kết nối: {str(e)}"}


# ─── Validate API Key ────────────────────────────────────────────

@router.post("/settings/validate-key")
async def validate_api_key(body: dict = Body(...)):
    """Validate API Key for a custom cloud provider."""
    provider = body.get("provider")
    api_key = body.get("api_key")
    model = body.get("model")

    if not provider or not api_key:
        raise HTTPException(status_code=400, detail="Missing provider or api_key")

    import httpx

    if api_key == "***":
        if provider == "deepseek":
            api_key = settings.deepseek_api_key
        elif provider == "gemini":
            api_key = settings.gemini_api_key
        elif provider == "claude":
            api_key = settings.claude_api_key
        elif provider == "groq":
            api_key = settings.groq_api_key
        elif provider == "nvidia":
            api_key = settings.nvidia_api_key
        elif provider == "freemodel":
            api_key = settings.freemodel_api_key

    if not api_key:
        return {"valid": False, "error": "Chưa có API Key."}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "gemini":
                model_name = model or "gemini-2.5-flash"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": "Say ok"}]}]}
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi Gemini: {err_msg}"}

            elif provider == "deepseek":
                url = "https://api.deepseek.com/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "deepseek-chat"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi DeepSeek: {err_msg}"}

            elif provider == "claude":
                url = "https://api.anthropic.com/v1/messages"
                headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
                model_name = model or "claude-3-5-haiku-20241022"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi Claude: {err_msg}"}

            elif provider == "groq":
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "llama-3.3-70b-versatile"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi Groq: {err_msg}"}

            elif provider == "nvidia":
                url = getattr(settings, "nvidia_url", "https://integrate.api.nvidia.com/v1").rstrip("/") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "moonshotai/kimi-k2.6"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi Nvidia: {err_msg}"}

            elif provider == "freemodel":
                url = getattr(settings, "freemodel_url", "https://api.freemodel.dev/v1").rstrip("/") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "gpt-4o-mini"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": f"Lỗi FreeModel: {err_msg}"}

            else:
                return {"valid": False, "error": f"Nhà cung cấp '{provider}' không hợp lệ."}

    except Exception as e:
        logger.error(f"Error validating API key: {e}")
        return {"valid": False, "error": f"Lỗi kết nối mạng: {str(e)}"}


# ─── Local Model (llama-server) ────────────────────────────────

@router.get("/local/status")
async def get_local_status():
    """Check if llama-server is running."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"{settings.llama_server_url}/health")
            if res.status_code == 200:
                return {
                    "connected": True,
                    "llama_server_url": settings.llama_server_url,
                    "model": settings.local_model,
                }
            else:
                return {
                    "connected": False,
                    "error": f"llama-server HTTP {res.status_code}",
                    "llama_server_url": settings.llama_server_url,
                }
    except Exception as e:
        return {
            "connected": False,
            "error": f"Không thể kết nối đến llama-server: {str(e)}",
            "llama_server_url": settings.llama_server_url,
        }


@router.get("/settings/cache-stats")
async def get_cache_stats():
    """Get number of cached LLM responses and embeddings."""
    from db.models import LLMCache, EmbeddingCache
    session = get_session(state.engine)
    try:
        llm_count = session.query(LLMCache).count()
        emb_count = session.query(EmbeddingCache).count()
        return {
            "llm_cache_count": llm_count,
            "embedding_cache_count": emb_count
        }
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}")
        return {"llm_cache_count": 0, "embedding_cache_count": 0}
    finally:
        session.close()


@router.post("/settings/cache-clear")
async def clear_cache():
    """Clear all LLM and embedding caches."""
    from db.models import LLMCache, EmbeddingCache
    session = get_session(state.engine)
    try:
        session.query(LLMCache).delete()
        session.query(EmbeddingCache).delete()
        session.commit()
        logger.info("Local LLM and Embedding cache cleared successfully")
        return {"status": "success", "message": "Đã xoá bộ nhớ đệm thành công"}
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/settings/model-status")
async def get_model_status():
    """Get the current loaded/unloaded status of offline models (embedding and cross-encoder)."""
    import time
    
    embedder_loaded = False
    embedder_last_used = 0.0
    embedder_idle_sec = 0.0
    
    reranker_loaded = False
    reranker_last_used = 0.0
    reranker_idle_sec = 0.0
    
    if hasattr(state, "embedder") and state.embedder is not None:
        embedder_loaded = state.embedder._model is not None
        embedder_last_used = getattr(state.embedder, "last_used", 0.0)
        embedder_idle_sec = max(0.0, time.time() - embedder_last_used) if embedder_last_used > 0 else 0.0
        
    if hasattr(state, "hybrid") and state.hybrid is not None:
        reranker_loaded = state.hybrid._cross_encoder is not None
        reranker_last_used = getattr(state.hybrid, "last_used", 0.0)
        reranker_idle_sec = max(0.0, time.time() - reranker_last_used) if reranker_last_used > 0 else 0.0
        
    return {
        "embedder": {
            "loaded": embedder_loaded,
            "last_used": embedder_last_used,
            "idle_seconds": int(embedder_idle_sec),
            "model_name": getattr(state.embedder, "model_name", "unknown") if hasattr(state, "embedder") else ""
        },
        "reranker": {
            "loaded": reranker_loaded,
            "last_used": reranker_last_used,
            "idle_seconds": int(reranker_idle_sec),
            "model_name": "cross-encoder/ms-marco-MiniLM-L-6-v2"
        }
    }

