import json

from fastapi import APIRouter, Body, HTTPException, Request
from common.text_utils import redact_api_key
from fastapi.responses import StreamingResponse
from loguru import logger

from common.i18n import t, get_language
from app_state import state
from config.settings import settings
from db.models import Setting
from db.database import get_session
from chat.generator_factory import build_generator

router = APIRouter(prefix="/api", tags=["Settings"])

ENV_ONLY_KEYS = {
    "llama_server_url",
    "local_model", "claude_model", "deepseek_model", "gemini_model",
    "groq_model", "github_model", "freemodel_model",
    "openrouter_model", "cohere_model", "cloudflare_model", "cerebras_model",
}


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
        "github_api_key": "***" if settings.github_api_key else "",
        "github_model": settings.github_model,
        "github_deepseek_v3_api_key": "***" if settings.github_deepseek_v3_api_key else "",
        "github_deepseek_v3_model": settings.github_deepseek_v3_model,
        "openrouter_api_key": "***" if settings.openrouter_api_key else "",
        "openrouter_model": settings.openrouter_model,
        "cohere_api_key": "***" if settings.cohere_api_key else "",
        "cohere_model": settings.cohere_model,
        "cloudflare_api_key": "***" if settings.cloudflare_api_key else "",
        "cloudflare_model": settings.cloudflare_model,
        "cerebras_api_key": "***" if settings.cerebras_api_key else "",
        "cerebras_model": settings.cerebras_model,
        "freemodel_api_key": "***" if settings.freemodel_api_key else "",
        "freemodel_model": settings.freemodel_model,
        "custom_cloud_provider": settings.custom_cloud_provider,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k_retrieval": settings.top_k_retrieval,
        "embedding_model": settings.embedding_model,
        "embedding_mode": settings.embedding_mode,
        "embedding_pooling": settings.embedding_pooling,
        "similarity_cutoff": settings.similarity_cutoff,
        "response_mode": settings.response_mode,
        "normalize_embeddings": settings.normalize_embeddings,
        "query_instruction": settings.query_instruction or settings.embedding_query_instruction,
        "passage_instruction": settings.passage_instruction or getattr(settings, "embedding_passage_instruction", ""),
        "embedding_query_instruction": settings.embedding_query_instruction or settings.query_instruction,
        "embedding_passage_instruction": getattr(settings, "embedding_passage_instruction", "") or settings.passage_instruction,
        "large_context_threshold": settings.large_context_threshold,
        "large_context_model": settings.large_context_model,
        "large_context_provider": settings.large_context_provider,
        "mmr_lambda": settings.mmr_lambda,
        "setup_completed": settings.setup_completed,
        "zotero_data_dir": getattr(settings, "zotero_data_dir", ""),
        "enable_reranker": settings.enable_reranker,
        "task_provider_map": settings.task_provider_map,
        "task_fallback_map": settings.task_fallback_map,
        "task_ultimate_fallback_chain": settings.task_ultimate_fallback_chain,
    }


@router.put("/settings")
async def update_settings(new_settings: dict = Body(...)):
    """Update settings."""
    session = get_session(state.engine)
    try:
        for key, value in new_settings.items():
            if hasattr(settings, key):
                if key.endswith("_api_key"):
                    if value == "***" or (not value and getattr(settings, key, None)):
                        continue
                if key in ("task_provider_map", "task_fallback_map", "task_ultimate_fallback_chain"):
                    if isinstance(value, str):
                        pass
                    elif isinstance(value, dict):
                        value = json.dumps(value, ensure_ascii=False)
                setattr(settings, key, value)
                if key == "embedding_query_instruction":
                    settings.query_instruction = value
                elif key == "embedding_passage_instruction":
                    settings.passage_instruction = value
                elif key == "query_instruction":
                    settings.embedding_query_instruction = value
                elif key == "passage_instruction":
                    settings.embedding_passage_instruction = value
                if key in ENV_ONLY_KEYS:
                    continue
                db_value = "None" if value is None else str(value)
                setting = session.query(Setting).filter(Setting.key == key).first()
                if setting:
                    setting.value = db_value
                else:
                    session.add(Setting(key=key, value=db_value))
        session.commit()

        if "embedding_mode" in new_settings:
            from ingestion.embedder import _embedder
            if _embedder is not None:
                if settings.embedding_mode == "cloud":
                    logger.info("Embedding mode set to cloud (Gemini API)")
                else:
                    logger.info("Embedding mode set to: {}", settings.embedding_mode)

        state.generator = build_generator()

        return {"status": "updated"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


# ─── Test Embedding Connection ────────────────────────────────────

@router.post("/settings/test-embedding")
async def test_embedding_connection(request: Request):
    """Test Gemini Embedding API connection."""
    lang = get_language(request)
    api_key = settings.gemini_api_key
    if not api_key:
        return {"success": False, "error": t("settings.no_gemini_key", lang)}

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
                return {"success": True, "dimension": dim, "message": t("settings.gemini_embed_success", lang, dim=dim)}
            else:
                try:
                    err = resp.json().get("error", {}).get("message", resp.text)
                except:
                    err = resp.text
                return {"success": False, "error": t("settings.gemini_api_error", lang, error=err)}
    except Exception as e:
        return {"success": False, "error": t("settings.embed_test_error", lang, error=str(e))}


# ─── Validate API Key ────────────────────────────────────────────

@router.post("/settings/validate-key")
async def validate_api_key(request: Request, body: dict = Body(...)):
    """Validate API Key for a custom cloud provider."""
    lang = get_language(request)
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
        elif provider == "github":
            api_key = settings.github_api_key
        elif provider == "github_deepseek_v3":
            api_key = settings.github_deepseek_v3_api_key
        elif provider == "openrouter":
            api_key = settings.openrouter_api_key
        elif provider == "cohere":
            api_key = settings.cohere_api_key
        elif provider == "cloudflare":
            api_key = settings.cloudflare_api_key
        elif provider == "cerebras":
            api_key = settings.cerebras_api_key
        elif provider == "freemodel":
            api_key = settings.freemodel_api_key

    if not api_key:
        return {"valid": False, "error": t("settings.no_api_key", lang)}

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
                    return {"valid": False, "error": t("settings.validate_error_gemini", lang, error=redact_api_key(err_msg))}

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
                    return {"valid": False, "error": t("settings.validate_error_deepseek", lang, error=err_msg)}

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
                    return {"valid": False, "error": t("settings.validate_error_claude", lang, error=err_msg)}

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
                    return {"valid": False, "error": t("settings.validate_error_groq", lang, error=err_msg)}

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
                    return {"valid": False, "error": t("settings.validate_error_nvidia", lang, error=err_msg)}

            elif provider == "github":
                url = getattr(settings, "github_url", "https://models.inference.ai.azure.com").rstrip("/") + "/chat/completions"
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
                    return {"valid": False, "error": t("settings.validate_error_github", lang, error=err_msg)}

            elif provider == "github_deepseek_v3":
                url = getattr(settings, "github_url", "https://models.inference.ai.azure.com").rstrip("/") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "DeepSeek-V3-0324"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": t("settings.validate_error_github_qwen", lang, error=err_msg)}

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
                    return {"valid": False, "error": t("settings.validate_error_freemodel", lang, error=err_msg)}

            elif provider == "openrouter":
                url = getattr(settings, "openrouter_url", "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "deepseek/deepseek-v4-flash"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": t("settings.validate_error_openrouter", lang, error=err_msg)}

            elif provider == "cohere":
                url = getattr(settings, "cohere_url", "https://api.cohere.ai/compatibility/v1").rstrip("/") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "command-r-plus"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": t("settings.validate_error_cohere", lang, error=err_msg)}

            elif provider == "cloudflare":
                url = getattr(settings, "cloudflare_url", "https://api.cloudflare.com/client/v4/accounts/adb9fb90009a849d8bc1635194a7dbd4/ai/v1").rstrip("/") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": t("settings.validate_error_cloudflare", lang, error=err_msg)}

            elif provider == "cerebras":
                url = getattr(settings, "cerebras_url", "https://api.cerebras.net/v1").rstrip("/") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                model_name = model or "qwen-3-235b-a22b-instruct-2507"
                payload = {"model": model_name, "messages": [{"role": "user", "content": "Say ok"}], "max_tokens": 5}
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    return {"valid": True}
                else:
                    try:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                    except:
                        err_msg = res.text
                    return {"valid": False, "error": t("settings.validate_error_cerebras", lang, error=err_msg)}

            else:
                return {"valid": False, "error": t("settings.invalid_provider", lang, provider=provider)}

    except Exception as e:
        logger.error(f"Error validating API key: {e}")
        return {"valid": False, "error": t("settings.validate_connection_error", lang, error=str(e))}


# ─── Local Model (llama-server) ────────────────────────────────

@router.get("/local/status")
async def get_local_status(request: Request):
    """Check if llama-server is running."""
    lang = get_language(request)
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
            "error": t("settings.llama_connect_fail", lang, error=str(e)),
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
async def clear_cache(request: Request):
    """Clear all LLM and embedding caches."""
    lang = get_language(request)
    from db.models import LLMCache, EmbeddingCache
    session = get_session(state.engine)
    try:
        session.query(LLMCache).delete()
        session.query(EmbeddingCache).delete()
        session.commit()
        logger.info("Local LLM and Embedding cache cleared successfully")
        return {"status": "success", "message": t("settings.cache_cleared", lang)}
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/settings/diagnostics")
async def get_settings_diagnostics():
    """Alias for system diagnostics — used by desktop settings panel."""
    from routers.system import get_diagnostics
    return await get_diagnostics()


@router.post("/settings/rebuild-fts")
async def rebuild_settings_fts():
    """Alias for FTS rebuild — used by desktop settings panel."""
    from routers.system import rebuild_fts_index
    return await rebuild_fts_index()


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
        embedder_loaded = True  # cloud embedding is always ready
        embedder_idle_sec = 0
        
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

