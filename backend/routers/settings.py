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
        "ollama_url": settings.ollama_url,
        "ollama_model": settings.ollama_model,
        "llm_mode": settings.llm_mode,
        "claude_api_key": "***" if settings.claude_api_key else "",
        "claude_model": settings.claude_model,
        "deepseek_api_key": "***" if settings.deepseek_api_key else "",
        "deepseek_model": settings.deepseek_model,
        "gemini_api_key": "***" if settings.gemini_api_key else "",
        "gemini_model": settings.gemini_model,
        "groq_api_key": "***" if settings.groq_api_key else "",
        "groq_model": settings.groq_model,
        "freemodel_api_key": "***" if settings.freemodel_api_key else "",
        "freemodel_model": settings.freemodel_model,
        "custom_cloud_provider": settings.custom_cloud_provider,
        "model_tier_weak": settings.model_tier_weak,
        "model_tier_medium": settings.model_tier_medium,
        "model_tier_strong": settings.model_tier_strong,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k_retrieval": settings.top_k_retrieval,
        "embedding_model": settings.embedding_model,
        "setup_completed": settings.setup_completed,
        "zotero_data_dir": getattr(settings, "zotero_data_dir", ""),
    }


@router.put("/settings")
async def update_settings(new_settings: dict = Body(...)):
    """Update settings."""
    session = get_session(state.engine)
    try:
        for key, value in new_settings.items():
            if hasattr(settings, key):
                if key in ("claude_api_key", "deepseek_api_key", "gemini_api_key", "groq_api_key", "freemodel_api_key"):
                    if value == "***" or (not value and getattr(settings, key, None)):
                        continue
                setattr(settings, key, value)
                setting = session.query(Setting).filter(Setting.key == key).first()
                if setting:
                    setting.value = str(value)
                else:
                    session.add(Setting(key=key, value=str(value)))
        session.commit()

        state.generator = Generator(
            ollama_url=settings.ollama_url,
            ollama_model=settings.ollama_model,
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
            freemodel_api_key=settings.freemodel_api_key,
            freemodel_model=settings.freemodel_model,
            freemodel_url=getattr(settings, "freemodel_url", "https://freemodel.dev/v1"),
            mode=settings.llm_mode,
            custom_cloud_provider=settings.custom_cloud_provider,
        )

        return {"status": "updated"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


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

    if not api_key:
        return {"valid": False, "error": "Chưa có API Key."}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "gemini":
                model_name = model or "gemini-1.5-flash"
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

            else:
                return {"valid": False, "error": f"Nhà cung cấp '{provider}' không hợp lệ."}

    except Exception as e:
        logger.error(f"Error validating API key: {e}")
        return {"valid": False, "error": f"Lỗi kết nối mạng: {str(e)}"}


# ─── Ollama ──────────────────────────────────────────────────────

@router.get("/ollama/status")
async def get_ollama_status():
    """Check if Ollama is running and list available models."""
    import httpx
    url = f"{settings.ollama_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                models_data = res.json().get("models", [])
                pulled_models = [m.get("name") for m in models_data]
                return {
                    "connected": True,
                    "models": pulled_models,
                    "ollama_url": settings.ollama_url
                }
            else:
                return {
                    "connected": False,
                    "error": f"Ollama HTTP {res.status_code}",
                    "ollama_url": settings.ollama_url
                }
    except Exception as e:
        return {
            "connected": False,
            "error": f"Không thể kết nối đến Ollama: {str(e)}",
            "ollama_url": settings.ollama_url
        }


@router.post("/ollama/pull")
async def pull_ollama_model(body: dict = Body(...)):
    """Pull an Ollama model and stream the progress back to the frontend."""
    model = body.get("model")
    if not model:
        raise HTTPException(status_code=400, detail="Missing model parameter")

    import httpx

    async def progress_generator():
        url = f"{settings.ollama_url}/api/pull"
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, json={"name": model, "stream": True}) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'status': 'error', 'message': f'Ollama error {response.status_code}'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        yield f"data: {line}\n\n"
        except Exception as e:
            logger.error(f"Error pulling Ollama model: {e}")
            yield f"data: {json.dumps({'status': 'error', 'message': f'Lỗi kết nối Ollama: {str(e)}'})}\n\n"

    return StreamingResponse(progress_generator(), media_type="text/event-stream")
