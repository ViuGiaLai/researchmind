from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, HTTPException

from common.secret_store import SecretStorageError, get_secret, set_secret
from config.settings import settings
from db.database import get_session
from db.models import Setting
from app_state import state
from licensing import LicenseError, verify_license_token

router = APIRouter(prefix="/api/license", tags=["License"])
LICENSE_SECRET_NAME = "commercial_license_token"
TRIAL_DAYS = 14

PLAN_FEATURES = {
    "free": ["library", "import", "search"],
    "trial": ["library", "import", "search", "chat", "review", "export", "graph"],
    "pro": ["library", "import", "search", "chat", "review", "export", "graph", "projects", "integrations"],
    "pro_plus": ["library", "import", "search", "chat", "review", "export", "graph", "projects", "integrations", "encrypted_sync", "priority_support"],
    "lab": ["library", "import", "search", "chat", "review", "export", "graph", "projects", "integrations", "encrypted_sync", "team", "audit_log", "priority_support", "lab"],
}


def _trial_started_at() -> datetime:
    session = get_session(state.engine)
    try:
        row = session.query(Setting).filter(Setting.key == "trial_started_at").first()
        if not row:
            started = datetime.now(timezone.utc)
            session.add(Setting(key="trial_started_at", value=started.isoformat()))
            session.commit()
            return started
        started = datetime.fromisoformat(row.value.replace("Z", "+00:00"))
        return started if started.tzinfo else started.replace(tzinfo=timezone.utc)
    finally:
        session.close()


def get_license_status() -> dict:
    try:
        token = get_secret(LICENSE_SECRET_NAME)
    except SecretStorageError:
        token = ""
    if token:
        try:
            claims = verify_license_token(token, settings.license_public_key)
            return {
                "plan": claims.plan,
                "active": True,
                "source": "license",
                "license_id": claims.license_id,
                "email": claims.email,
                "expires_at": claims.expires_at.isoformat() if claims.expires_at else None,
                "features": sorted(set(PLAN_FEATURES[claims.plan]) | set(claims.features)),
            }
        except LicenseError as exc:
            license_error = str(exc)
    else:
        license_error = ""

    started = _trial_started_at()
    trial_ends = started + timedelta(days=TRIAL_DAYS)
    trial_active = datetime.now(timezone.utc) < trial_ends
    return {
        "plan": "trial" if trial_active else "free",
        "active": trial_active,
        "source": "trial" if trial_active else "free",
        "license_id": "",
        "email": "",
        "expires_at": trial_ends.isoformat() if trial_active else None,
        "features": PLAN_FEATURES["trial" if trial_active else "free"],
        "error": license_error,
    }


@router.get("/status")
async def license_status():
    return get_license_status()


@router.get("/entitlements")
async def entitlements():
    status = get_license_status()
    return {
        "plan": status["plan"],
        "active": status["active"],
        "features": status["features"],
        "limits": {
            "workspace_members": 25 if "team" in status["features"] else 1,
            "sync_devices": 10 if "encrypted_sync" in status["features"] else 1,
        },
    }


@router.post("/activate")
async def activate_license(body: dict = Body(...)):
    token = str(body.get("token", "")).strip()
    if not token:
        raise HTTPException(status_code=400, detail="License token is required.")
    try:
        verify_license_token(token, settings.license_public_key)
        set_secret(LICENSE_SECRET_NAME, token)
    except LicenseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SecretStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return get_license_status()


@router.delete("")
async def deactivate_license():
    try:
        set_secret(LICENSE_SECRET_NAME, "")
    except SecretStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return get_license_status()
