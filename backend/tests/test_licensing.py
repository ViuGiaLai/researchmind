import base64
import json
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from licensing import LicenseError, verify_license_token


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _token(payload: dict) -> tuple[str, str]:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    payload_part = _encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = private_key.sign(payload_part.encode("ascii"))
    return f"{payload_part}.{_encode(signature)}", _encode(public_key)


def test_valid_signed_license():
    token, public_key = _token({
        "license_id": "lic_2026_001",
        "plan": "pro",
        "email": "researcher@example.com",
        "expires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        "features": ["priority_support"],
    })
    claims = verify_license_token(token, public_key)
    assert claims.plan == "pro"
    assert claims.license_id == "lic_2026_001"
    assert "priority_support" in claims.features


def test_tampered_license_is_rejected():
    token, public_key = _token({"license_id": "lic_1", "plan": "pro"})
    payload, signature = token.split(".")
    tampered = ("A" if payload[0] != "A" else "B") + payload[1:]
    with pytest.raises(LicenseError, match="signature"):
        verify_license_token(f"{tampered}.{signature}", public_key)


def test_expired_license_is_rejected():
    token, public_key = _token({
        "license_id": "lic_expired",
        "plan": "pro",
        "expires_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
    })
    with pytest.raises(LicenseError, match="expired"):
        verify_license_token(token, public_key)
