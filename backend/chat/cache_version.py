"""Stable cache fingerprints for prompts, models, and indexed documents."""
import hashlib
import json
PROMPT_CONTRACT_VERSION = "2026-07-18.1"
def cache_fingerprint(*, model: str, provider: str, prompt: str, context: str, paper_versions: dict | None = None) -> str:
    payload = {"contract": PROMPT_CONTRACT_VERSION, "model": model, "provider": provider, "prompt": prompt, "context_hash": hashlib.sha256((context or "").encode()).hexdigest(), "papers": paper_versions or {}}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
