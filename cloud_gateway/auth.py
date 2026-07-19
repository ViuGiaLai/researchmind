"""Authentication boundary for the public gateway."""

import json
from functools import lru_cache
from fastapi import Header, HTTPException

from .config import get_settings


@lru_cache
def _firebase_app():
    settings = get_settings()
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ModuleNotFoundError as exc:
        raise RuntimeError("firebase-admin is required when Firebase authentication is enabled") from exc
    try:
        return firebase_admin.get_app()
    except ValueError:
        if settings.firebase_service_account_json:
            credential = credentials.Certificate(json.loads(settings.firebase_service_account_json))
            return firebase_admin.initialize_app(
                credential,
                {"projectId": settings.firebase_project_id} if settings.firebase_project_id else None,
            )
        return firebase_admin.initialize_app(
            options={"projectId": settings.firebase_project_id} if settings.firebase_project_id else None
        )


async def require_user(authorization: str = Header(default="")) -> dict:
    settings = get_settings()
    token = authorization.removeprefix("Bearer ").strip() if authorization.startswith("Bearer ") else ""
    if settings.gateway_shared_token and token == settings.gateway_shared_token:
        return {"uid": "shared-development-client", "auth": "shared"}
    if token and settings.firebase_project_id:
        try:
            from firebase_admin import auth
            claims = auth.verify_id_token(token, app=_firebase_app())
            return {**claims, "uid": str(claims["uid"]), "auth": "firebase"}
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired access token") from exc
    if settings.allow_unauthenticated and not settings.production:
        return {"uid": "anonymous-development-client", "auth": "anonymous"}
    raise HTTPException(status_code=401, detail="Authentication required")


def validate_auth_configuration() -> None:
    settings = get_settings()
    if settings.production and not settings.firebase_project_id:
        raise RuntimeError("FIREBASE_PROJECT_ID is required in production")
    if settings.production and settings.allow_unauthenticated:
        raise RuntimeError("ALLOW_UNAUTHENTICATED cannot be enabled in production")

