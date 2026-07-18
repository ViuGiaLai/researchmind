"""Issue a signed ResearchMind license from a trusted admin host."""

import argparse
import base64
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def generate_keypair() -> None:
    private = Ed25519PrivateKey.generate()
    private_raw = private.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    public_raw = private.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    print("RESEARCHMIND_LICENSE_PRIVATE_KEY=" + encode(private_raw))
    print("LICENSE_PUBLIC_KEY=" + encode(public_raw))


def issue(email: str, plan: str, days: int, license_id: str) -> None:
    raw_key = os.environ.get("RESEARCHMIND_LICENSE_PRIVATE_KEY", "").strip()
    if not raw_key:
        raise SystemExit("RESEARCHMIND_LICENSE_PRIVATE_KEY is required.")
    private = Ed25519PrivateKey.from_private_bytes(decode(raw_key))
    now = datetime.now(timezone.utc)
    payload = {
        "license_id": license_id or "lic_" + uuid.uuid4().hex,
        "plan": plan,
        "email": email,
        "issued_at": now.isoformat(),
        "expires_at": (now + timedelta(days=days)).isoformat(),
        "features": [],
    }
    payload_part = encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode())
    signature = encode(private.sign(payload_part.encode("ascii")))
    print(payload_part + "." + signature)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate-keypair", action="store_true")
    parser.add_argument("--email", default="")
    parser.add_argument("--plan", choices=["pro", "pro_plus", "lab"], default="pro")
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--license-id", default="")
    args = parser.parse_args()
    if args.generate_keypair:
        generate_keypair()
    elif args.email:
        issue(args.email, args.plan, args.days, args.license_id)
    else:
        raise SystemExit("--email is required.")


if __name__ == "__main__":
    main()
