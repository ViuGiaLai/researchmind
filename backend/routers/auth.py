from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from common.firebase_auth import FirebaseAuthError, upsert_user_profile
from common.i18n import get_language, t
from config.settings import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

_DESKTOP_OAUTH_TTL_SECONDS = 180
_desktop_oauth_lock = asyncio.Lock()


@dataclass
class DesktopOAuthSession:
    verifier: str
    expires_at: float
    id_token: str | None = None
    error: str | None = None


_desktop_oauth_sessions: dict[str, DesktopOAuthSession] = {}


class DesktopOAuthStart(BaseModel):
    state: str = Field(min_length=32, max_length=256)
    verifier: str = Field(min_length=32, max_length=256)


class DesktopOAuthStatus(DesktopOAuthStart):
    pass


def _oauth_callback_page(title: str, message: str, *, success: bool = False, lang: str = "vi") -> HTMLResponse:
    accent = "#2dd4bf" if success else "#fca5a5"
    return HTMLResponse(f"""<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ResearchMind</title>
  <style>
    :root {{ color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111618; color: #ecf3f4; }}
    main {{ width: min(92vw, 440px); padding: 42px 36px; text-align: center; border: 1px solid #2f3a3e; border-radius: 20px; background: #1a2124; box-shadow: 0 24px 70px rgba(0,0,0,.35); }}
    .mark {{ width: 42px; height: 42px; margin: 0 auto 20px; display: grid; place-items: center; border-radius: 50%; background: {accent}; color: #042f2e; font-size: 22px; font-weight: 800; }}
    .brand {{ margin: 0 0 24px; color: #a8b4b8; font-size: 14px; font-weight: 700; letter-spacing: -.02em; }}
    h1 {{ margin: 0; font-size: 25px; letter-spacing: -.04em; }}
    p {{ margin: 12px 0 0; color: #a8b4b8; line-height: 1.55; }}
    small {{ display: block; margin-top: 24px; color: #7a8a90; }}
  </style>
</head>
</html>""")


def _oauth_config() -> tuple[str, str, str]:
    client_id = settings.google_oauth_client_id.strip()
    client_secret = settings.google_oauth_client_secret.strip()
    callback_url = settings.desktop_google_callback_url.strip()
    if not callback_url and settings.public_backend_url.strip():
        callback_url = f"{settings.public_backend_url.rstrip('/')}/api/auth/desktop/google/callback"
    if not client_id or not client_secret or not callback_url:
        raise HTTPException(
            status_code=503,
            detail="Google desktop OAuth is not configured on the backend.",
        )
    return client_id, client_secret, callback_url


def _clear_expired_sessions() -> None:
    now = time.monotonic()
    for state, session in list(_desktop_oauth_sessions.items()):
        if session.expires_at <= now:
            del _desktop_oauth_sessions[state]


@router.post("/desktop/google/start")
async def start_desktop_google_sign_in(payload: DesktopOAuthStart):
    """Create a short-lived native-app OAuth session and return Google's URL."""
    client_id, _client_secret, callback_url = _oauth_config()
    async with _desktop_oauth_lock:
        _clear_expired_sessions()
        if payload.state in _desktop_oauth_sessions:
            raise HTTPException(status_code=409, detail="OAuth session already exists.")
        _desktop_oauth_sessions[payload.state] = DesktopOAuthSession(
            verifier=payload.verifier,
            expires_at=time.monotonic() + _DESKTOP_OAUTH_TTL_SECONDS,
        )

    query = urlencode({
        "client_id": client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "state": payload.state,
        "prompt": "select_account",
        "access_type": "online",
    })
    return {"authorizationUrl": f"https://accounts.google.com/o/oauth2/v2/auth?{query}"}


@router.get("/desktop/google/callback", response_class=HTMLResponse)
async def finish_desktop_google_sign_in(request: Request, state: str = "", code: str = "", error: str = ""):
    """Receive Google's browser callback and save its ID token for one polling client."""
    lang = get_language(request)
    async with _desktop_oauth_lock:
        _clear_expired_sessions()
        session = _desktop_oauth_sessions.get(state)
        if not session:
            return _oauth_callback_page(t("auth.oauth_session_expired_title", lang), t("auth.oauth_session_expired_msg", lang), lang=lang)
        if error or not code:
            session.error = t("auth.oauth_cancelled_msg", lang)
            return _oauth_callback_page(t("auth.oauth_cancelled_title", lang), t("auth.oauth_cancelled_msg2", lang), lang=lang)

    client_id, client_secret, callback_url = _oauth_config()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": callback_url,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            id_token = str(response.json().get("id_token", ""))
        if not id_token:
            raise ValueError("Google did not return an ID token.")
    except (httpx.HTTPError, ValueError):
        async with _desktop_oauth_lock:
            session = _desktop_oauth_sessions.get(state)
            if session:
                session.error = t("auth.oauth_verify_failed_msg", lang)
        return _oauth_callback_page(t("auth.oauth_verify_failed_title", lang), t("auth.oauth_verify_failed_msg", lang), lang=lang)

    async with _desktop_oauth_lock:
        session = _desktop_oauth_sessions.get(state)
        if not session:
            return _oauth_callback_page(t("auth.oauth_session_expired_title", lang), t("auth.oauth_session_expired_msg", lang), lang=lang)
        session.id_token = id_token
    return _oauth_callback_page(t("auth.oauth_complete_title", lang), t("auth.oauth_complete_msg", lang), success=True, lang=lang)


@router.post("/desktop/google/status")
async def get_desktop_google_sign_in_status(payload: DesktopOAuthStatus):
    """Return the Google ID token once to the desktop client that owns this session."""
    async with _desktop_oauth_lock:
        _clear_expired_sessions()
        session = _desktop_oauth_sessions.get(payload.state)
        if not session or not secrets.compare_digest(session.verifier, payload.verifier):
            raise HTTPException(status_code=404, detail="OAuth session was not found.")
        if session.error:
            del _desktop_oauth_sessions[payload.state]
            return {"status": "error", "message": session.error}
        if session.id_token:
            id_token = session.id_token
            del _desktop_oauth_sessions[payload.state]
            return {"status": "complete", "idToken": id_token}
    return {"status": "pending"}


@router.get("/me")
async def current_user(request: Request):
    """Create/update the Firebase profile after a verified Google sign-in."""
    claims = getattr(request.state, "firebase_claims", None)
    if not claims:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        profile = await asyncio.to_thread(upsert_user_profile, claims)
    except FirebaseAuthError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"user": profile}
