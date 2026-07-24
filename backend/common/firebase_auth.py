"""Firebase Admin integration for hosted ResearchMind deployments.

The client never receives the service-account credential. It only sends a
short-lived Firebase ID token, which this module verifies server-side.
"""

from __future__ import annotations

import json
import os
from typing import Any

from config.settings import settings


class FirebaseAuthError(Exception):
    """Raised when Firebase authentication cannot verify a request."""


def _admin_modules():
    try:
        import firebase_admin
        from firebase_admin import auth, credentials, firestore
    except ModuleNotFoundError as exc:  # Keeps local mode usable without Firebase.
        raise FirebaseAuthError("Firebase Admin SDK is not installed on the server.") from exc
    return firebase_admin, auth, credentials, firestore


def get_firebase_app():
    """Initialize Firebase once using a Render secret file or JSON variable."""
    firebase_admin, _auth, credentials, _firestore = _admin_modules()
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if credential_path:
        credential = credentials.Certificate(credential_path)
    elif settings.firebase_service_account_json.strip():
        try:
            credential = credentials.Certificate(json.loads(settings.firebase_service_account_json))
        except json.JSONDecodeError as exc:
            raise FirebaseAuthError("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.") from exc
    else:
        raise FirebaseAuthError("Firebase is enabled but no service-account credential was configured.")

    options: dict[str, str] = {}
    if settings.firebase_project_id.strip():
        options["projectId"] = settings.firebase_project_id.strip()
    return firebase_admin.initialize_app(credential, options or None)


def ensure_firebase_ready() -> None:
    """Fail deployment startup rather than accidentally exposing an open API."""
    if settings.firebase_auth_enabled:
        get_firebase_app()


def verify_id_token(id_token: str) -> dict[str, Any]:
    """Verify a Firebase-issued ID token and return its trusted claims."""
    _firebase_admin, auth, _credentials, _firestore = _admin_modules()
    try:
        return dict(auth.verify_id_token(id_token, app=get_firebase_app()))
    except Exception as exc:
        raise FirebaseAuthError("Invalid or expired Firebase ID token.") from exc


def upsert_user_profile(claims: dict[str, Any]) -> dict[str, Any]:
    """Create/update the minimal account profile stored in Cloud Firestore."""
    _firebase_admin, _auth, _credentials, firestore = _admin_modules()
    uid = str(claims["uid"])
    profile = {
        "email": claims.get("email", ""),
        "displayName": claims.get("name", ""),
        "photoURL": claims.get("picture", ""),
        "provider": claims.get("firebase", {}).get("sign_in_provider", "unknown"),
    }
    data = {
        **profile,
        "lastLoginAt": firestore.SERVER_TIMESTAMP,
    }
    firestore.client(app=get_firebase_app()).collection("users").document(uid).set(data, merge=True)
    return {"uid": uid, **profile}
