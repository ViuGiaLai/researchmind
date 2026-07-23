"""Offline-verifiable commercial license tokens.

Tokens are JSON payloads signed with Ed25519. The desktop bundle contains only
the public key; the private signing key must stay in the payment backend.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime


class LicenseError(ValueError):
    pass


def _decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(value + padding)
    except Exception as exc:
        raise LicenseError("License encoding is invalid.") from exc


@dataclass(frozen=True)
class LicenseClaims:
    license_id: str
    plan: str
    email: str
    expires_at: datetime | None
    features: tuple[str, ...]

    @property
    def expired(self) -> bool:
        return bool(self.expires_at and self.expires_at <= datetime.now(UTC))


def verify_license_token(token: str, public_key_b64: str) -> LicenseClaims:
    if not public_key_b64:
        raise LicenseError("This build has no commercial license public key.")
    try:
        payload_part, signature_part = token.strip().split(".", 1)
    except ValueError as exc:
        raise LicenseError("License token format is invalid.") from exc

    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

        public_key = Ed25519PublicKey.from_public_bytes(_decode(public_key_b64))
        public_key.verify(_decode(signature_part), payload_part.encode("ascii"))
        payload = json.loads(_decode(payload_part))
    except LicenseError:
        raise
    except Exception as exc:
        raise LicenseError("License signature is invalid.") from exc

    plan = str(payload.get("plan", "")).lower()
    if plan not in {"pro", "pro_plus", "lab"}:
        raise LicenseError("License plan is not supported.")
    expires_raw = payload.get("expires_at")
    expires_at = None
    if expires_raw:
        try:
            expires_at = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
        except ValueError as exc:
            raise LicenseError("License expiration is invalid.") from exc

    claims = LicenseClaims(
        license_id=str(payload.get("license_id", "")).strip(),
        plan=plan,
        email=str(payload.get("email", "")).strip(),
        expires_at=expires_at,
        features=tuple(str(item) for item in payload.get("features", [])),
    )
    if not claims.license_id:
        raise LicenseError("License ID is missing.")
    if claims.expired:
        raise LicenseError("License has expired.")
    return claims
