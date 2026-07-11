import json
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import Request

_LOCALE_DIR = Path(__file__).resolve().parent.parent / "locales"

SUPPORTED_LANGS = {"vi", "en", "ja"}
_DEFAULT_LANG = "vi"

_cache: dict[str, dict[str, str]] = {}

_RE_BRACE = re.compile(r"\{([a-zA-Z0-9_]+)\}")


def _load_locale(lang: str) -> dict[str, str]:
    if lang in _cache:
        return _cache[lang]
    path = _LOCALE_DIR / f"{lang}.json"
    if not path.exists():
        _cache[lang] = {}
        return _cache[lang]
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        _cache[lang] = data
        return data
    except Exception:
        _cache[lang] = {}
        return _cache[lang]


def t(key: str, lang: str = _DEFAULT_LANG, **kwargs) -> str:
    try:
        data = _load_locale(lang)
        template = data.get(key)
        if template is None and lang != _DEFAULT_LANG:
            template = _load_locale(_DEFAULT_LANG).get(key)
        if template is None:
            template = key
        if kwargs:
            return _RE_BRACE.sub(lambda m: str(kwargs.get(m.group(1), m.group(0))), template)
        return template
    except Exception:
        return key


def normalize_language(lang: str, default: str = _DEFAULT_LANG) -> str:
    if not lang:
        return default
    lang = lang.split("-")[0].strip().lower()
    return lang if lang in SUPPORTED_LANGS else default


def get_language(request: Request, default: str = _DEFAULT_LANG) -> str:
    lang = request.headers.get("x-language", "")
    if lang:
        lang = lang.split("-")[0].strip().lower()
        if lang in SUPPORTED_LANGS:
            return lang
    accept = request.headers.get("accept-language", "")
    if accept:
        for part in accept.split(","):
            code = part.strip().split(";")[0].split("-")[0].lower()
            if code in SUPPORTED_LANGS:
                return code
    return default


_LANGUAGE_NAMES: dict[str, str] = {
    "vi": "Tiếng Việt",
    "en": "English",
    "ja": "日本語",
}


def get_output_language_name(lang: str) -> str:
    return _LANGUAGE_NAMES.get(lang, _LANGUAGE_NAMES[_DEFAULT_LANG])


def reload_locales():
    _cache.clear()
    for lang in SUPPORTED_LANGS:
        _load_locale(lang)
