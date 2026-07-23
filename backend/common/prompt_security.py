"""Prompt-injection and privacy guards for untrusted research content."""
import re

_INJECTION = re.compile(r"(?im)^\s*(?:system|assistant|developer)\s*:|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|<\|im_(?:start|end)\|>")
_SECRET = re.compile(r"(?i)\b(?:sk-[a-z0-9_-]{16,}|AIza[a-z0-9_-]{20,}|ghp_[a-z0-9]{20,}|bearer\s+[a-z0-9._-]{16,})\b")
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
def neutralize_untrusted_text(text: str) -> tuple[str, bool]:
    detected = bool(_INJECTION.search(text or ""))
    return _INJECTION.sub("[UNTRUSTED INSTRUCTION REMOVED]", text or ""), detected
def redact_sensitive_text(text: str, redact_email: bool = False) -> str:
    value = _SECRET.sub("[REDACTED SECRET]", text or "")
    return _EMAIL.sub("[REDACTED EMAIL]", value) if redact_email else value
