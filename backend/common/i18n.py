import json
import re
from contextvars import ContextVar
from pathlib import Path

from fastapi import Request

_LOCALE_DIR = Path(__file__).resolve().parent.parent / "locales"
SUPPORTED_LANGS = {"vi", "en", "ja"}
_DEFAULT_LANG = "vi"
_cache: dict[str, dict[str, str]] = {}
_RE_BRACE = re.compile(r"{([a-zA-Z0-9_]+)}")
_REQUEST_LANGUAGE: ContextVar[str] = ContextVar("request_language", default="")


def _load_locale(lang: str) -> dict[str, str]:
    if lang in _cache:
        return _cache[lang]
    path = _LOCALE_DIR / f"{lang}.json"
    if not path.exists():
        _cache[lang] = {}
        return _cache[lang]
    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        _cache[lang] = data
    except (OSError, json.JSONDecodeError):
        _cache[lang] = {}
    return _cache[lang]


def t(key: str, lang: str = _DEFAULT_LANG, **kwargs: object) -> str:
    data = _load_locale(lang)
    template = data.get(key)
    if template is None and lang != _DEFAULT_LANG:
        template = _load_locale(_DEFAULT_LANG).get(key)
    if template is None:
        template = key
    if not kwargs:
        return template
    return _RE_BRACE.sub(lambda match: str(kwargs.get(match.group(1), match.group(0))), template)


def normalize_language(lang: str, default: str = _DEFAULT_LANG) -> str:
    if not lang:
        return default
    normalized = lang.split("-")[0].strip().lower()
    return normalized if normalized in SUPPORTED_LANGS else default


def get_language(request: Request, default: str = _DEFAULT_LANG) -> str:
    explicit = normalize_language(request.headers.get("x-language", ""), "")
    if explicit:
        return explicit
    for part in request.headers.get("accept-language", "").split(","):
        candidate = normalize_language(part.strip().split(";")[0], "")
        if candidate:
            return candidate
    return default


def set_request_language(lang: str) -> None:
    """Set the language for the current request and any asyncio.to_thread calls."""
    _REQUEST_LANGUAGE.set(normalize_language(lang, ""))


_LANGUAGE_NAMES = {"vi": "Vietnamese", "en": "English", "ja": "Japanese"}


def get_output_language_name(lang: str) -> str:
    return _LANGUAGE_NAMES.get(lang, _LANGUAGE_NAMES[_DEFAULT_LANG])


def infer_language(text: str, default: str = _DEFAULT_LANG) -> str:
    return "ja" if any(0x3040 <= ord(char) <= 0x9FFF for char in text) else ("vi" if any(ord(char) > 127 for char in text) else ("en" if re.search(r"[A-Za-z]", text) else default))


def get_prompt_language(user_text: str = "", requested_language: str = "") -> str:
    explicit = normalize_language(requested_language, "")
    if explicit:
        return explicit
    request_language = normalize_language(_REQUEST_LANGUAGE.get(), "")
    if request_language:
        return request_language
    try:
        from config.settings import settings
        configured = str(getattr(settings, "output_language", "auto") or "auto")
    except Exception:
        configured = "auto"
    if configured.lower() != "auto":
        normalized = normalize_language(configured, "")
        if normalized:
            return normalized
    return infer_language(user_text)


def get_language_instruction(user_text: str = "", requested_language: str = "") -> str:
    language = get_prompt_language(user_text, requested_language)
    return '## OUTPUT LANGUAGE' + chr(10) + 'Write the complete response in ' + get_output_language_name(language) + '. Keep proper nouns, citations, identifiers, code, and quoted source text unchanged.'


def reload_locales() -> None:
    _cache.clear()
    for lang in SUPPORTED_LANGS:
        _load_locale(lang)
