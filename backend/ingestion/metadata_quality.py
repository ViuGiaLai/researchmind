"""Title/author quality checks and Vietnamese OCR cleanup.

Used during import and when serializing papers for the UI so UUID stems,
logo captions, scanner device names, and broken Vietnamese OCR do not
surface as document titles or authors.
"""

from __future__ import annotations

import re
from pathlib import Path

# UUID (with optional surrounding separators) at start of stored filename/title
UUID_PREFIX_RE = re.compile(
    r"^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    r"(?:[_ \-]+)?",
    re.IGNORECASE,
)
UUID_ONLY_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
# Long hex-ish ids without hyphens
HEX_ID_RE = re.compile(r"^[0-9a-f]{16,}$", re.IGNORECASE)

# Captions / UI chrome / logo OCR that should never be a paper title
JUNK_TITLE_RE = re.compile(
    r"(?i)\b("
    r"logo|watermark|copyright|all\s+rights\s+reserved|"
    r"h[ìi]nh\s*\d+|figure\s*\d+|fig\.?\s*\d+|"
    r"table\s*\d+|b[ảa]ng\s*\d+|"
    r"slide\s*\d+|page\s*\d+|"
    r"untitled|document1|new\s+document|"
    r"microsoft\s+word|adobe\s+acrobat|"
    r"t[ốo]i\s+gi[ảa]n|hi[ệe]n\s+[đd][ạa]i|"
    r"v[àa]ng\s+[đd]en|black\s+and\s+gold"
    r")\b"
)

# Device / scanner / OS placeholders often written into PDF Author field
DEVICE_OR_PLACEHOLDER_RE = re.compile(
    r"(?i)^("
    r"unknown(?:\s*[:\-].*)?|"
    r"anonymous|n/?a|none|null|undefined|"
    r"user|admin|owner|pc|desktop|laptop|"
    r"acer|asus|dell|hp|lenovo|msi|toshiba|sony|samsung|"
    r"canon|epson|brother|xerox|ricoh|fujitsu|"
    r"windows\s*user|mac\s*user|author"
    r")$"
)

AUTHOR_IGNORED = {
    "unknown",
    "anonymous",
    "n/a",
    "none",
    "null",
    "undefined",
    "author",
    "user",
    "admin",
}

# Vietnamese syllables with tone often get split before final 1–2 letters by OCR
_VN_TONE_CHARS = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ"
_VN_SPLIT_RE = re.compile(
    rf"([A-Za-zĐđÀ-ỹ]*[{_VN_TONE_CHARS}])\s+([a-zđ]{{1,2}})(?=[\s.,;:!?\)\]\"']|$)",
    re.UNICODE,
)
# Also: base letter + space + tone-bearing fragment of 1–2 chars ("ngườ i")
_VN_TRAIL_RE = re.compile(
    rf"([A-Za-zĐđ]{{2,8}})\s+([{_VN_TONE_CHARS}][a-zđ]{{0,1}})(?=[\s.,;:!?\)\]\"']|$)",
    re.UNICODE,
)
# Single isolated combining-looking splits: "thiế t", "xuấ t", "dấ u"
_VN_FINAL_CONSONANT_RE = re.compile(
    rf"([A-Za-zĐđÀ-ỹ]*[{_VN_TONE_CHARS}])\s+([ptcngmyiuđ]{{1,2}})(?=[\s.,;:!?\)\]\"']|$)",
    re.IGNORECASE | re.UNICODE,
)


def strip_uuid_prefix(value: str) -> str:
    """Remove leading UUID prefix commonly prepended when storing papers on disk."""
    if not value:
        return ""
    cleaned = UUID_PREFIX_RE.sub("", value.strip())
    return cleaned.strip(" _-") or value.strip()


def humanize_filename(filename: str) -> str:
    """Turn a filename into a readable title candidate."""
    if not filename:
        return ""
    name = Path(filename).name
    name = strip_uuid_prefix(name)
    stem = Path(name).stem if "." in name else name
    stem = strip_uuid_prefix(stem)
    stem = stem.replace("+", " ").replace("%20", " ")
    stem = re.sub(r"[_\-]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem


def is_uuid_like(value: str) -> bool:
    if not value:
        return False
    text = value.strip()
    if UUID_ONLY_RE.match(text):
        return True
    if HEX_ID_RE.match(text):
        return True
    # UUID + junk remaining after partial strip
    if UUID_PREFIX_RE.match(text) and len(strip_uuid_prefix(text)) < 4:
        return True
    return False


def is_poor_title(value: str | None) -> bool:
    """Return True when *value* should not be shown as a paper title."""
    if not value:
        return True
    text = value.strip()
    if not text:
        return True
    if is_uuid_like(text):
        return True
    if UUID_PREFIX_RE.match(text):
        # Still starts with UUID even if more text follows — usually storage name
        remainder = strip_uuid_prefix(text)
        if not remainder or is_uuid_like(remainder):
            return True
        # Prefer stripping at display time, but treat pure storage names as poor
        if re.fullmatch(r"[0-9a-f\-]{20,}_.+", text, flags=re.IGNORECASE):
            return True
    if len(text) < 4:
        return True
    if JUNK_TITLE_RE.search(text):
        return True
    alpha = sum(1 for c in text if c.isalpha())
    if alpha / max(len(text), 1) < 0.35:
        return True
    # Too many short OCR tokens with no real phrase
    tokens = [t for t in re.split(r"\s+", text) if t]
    if len(tokens) >= 4 and sum(1 for t in tokens if len(t) <= 2) / len(tokens) > 0.6:
        return True
    return False


def is_poor_author(value: str | None) -> bool:
    if not value:
        return True
    text = value.strip()
    if not text:
        return True
    if text.lower() in AUTHOR_IGNORED:
        return True
    if DEVICE_OR_PLACEHOLDER_RE.match(text):
        return True
    if "@" in text:
        return True
    if is_uuid_like(text):
        return True
    # "Unknown: Acer", "User - HP"
    if re.match(r"(?i)^(unknown|anonymous|user|admin)\s*[:\-]", text):
        return True
    if len(text) < 2:
        return True
    return False


def clean_authors(authors: list[str] | None) -> list[str]:
    if not authors:
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in authors:
        if not isinstance(raw, str):
            continue
        part = raw.strip().strip("\"'")
        if is_poor_author(part):
            continue
        key = part.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(part)
    return cleaned


def repair_vietnamese_ocr_text(text: str) -> str:
    """Merge common RapidOCR syllable splits in Vietnamese text."""
    if not text or not any(c in text for c in _VN_TONE_CHARS):
        return text

    result = text
    for _ in range(4):
        prev = result
        result = _VN_SPLIT_RE.sub(r"\1\2", result)
        result = _VN_FINAL_CONSONANT_RE.sub(r"\1\2", result)
        result = _VN_TRAIL_RE.sub(r"\1\2", result)
        # Collapse runs of spaces created by OCR (keep newlines)
        result = re.sub(r"[^\S\n]{2,}", " ", result)
        if result == prev:
            break
    return result


def normalize_ocr_page_text(text: str) -> str:
    """Post-process a single page of OCR / extracted text."""
    if not text:
        return text
    cleaned = text.replace("\x00", " ")
    cleaned = repair_vietnamese_ocr_text(cleaned)
    # Soft-normalize NBSP and odd separators
    cleaned = cleaned.replace("\u00a0", " ").replace("\u200b", "")
    return cleaned


def score_title_candidate(value: str | None) -> int:
    """Higher is better. Negative means reject."""
    if not value or is_poor_title(value):
        return -100
    text = value.strip()
    score = 10
    # Prefer academic-ish length
    n = len(text)
    if 12 <= n <= 180:
        score += 20
    elif 8 <= n < 12 or 180 < n <= 240:
        score += 5
    else:
        score -= 5
    # Prefer multi-word phrases
    words = [w for w in re.split(r"\s+", text) if w]
    if 3 <= len(words) <= 20:
        score += 15
    elif len(words) == 2:
        score += 5
    # Penalize storage-looking names
    if UUID_PREFIX_RE.search(text):
        score -= 40
    if re.search(r"\.(pdf|docx?|txt|md|html?|epub)$", text, re.I):
        score -= 10
    if JUNK_TITLE_RE.search(text):
        score -= 80
    # Prefer titles without heavy OCR fragmentation
    short_ratio = sum(1 for w in words if len(w) <= 2) / max(len(words), 1)
    if short_ratio > 0.4:
        score -= 15
    return score


def resolve_paper_title(
    *,
    metadata_title: str | None = None,
    suggested_title: str | None = None,
    filename: str | None = None,
    stored_path: str | None = None,
    max_chars: int = 200,
) -> str:
    """Pick the best display title from available sources.

    Priority is score-based so first-page OCR captions (logos) never beat a
    clean original filename or PDF metadata title.
    """
    candidates: list[str] = []

    def _add(raw: str | None) -> None:
        if not raw:
            return
        text = strip_uuid_prefix(str(raw).strip())
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            candidates.append(text[:max_chars].strip())

    _add(metadata_title)
    _add(suggested_title)
    _add(humanize_filename(filename or ""))
    if stored_path:
        _add(humanize_filename(Path(stored_path).name))

    best = ""
    best_score = -10_000
    for cand in candidates:
        s = score_title_candidate(cand)
        if s > best_score:
            best_score = s
            best = cand

    if best_score < 0 or not best:
        # Last resort: humanized filename even if weak
        fallback = humanize_filename(filename or stored_path or "")
        if fallback and not is_uuid_like(fallback):
            return fallback[:max_chars]
        return "Untitled document"

    # If winner still has UUID prefix residue, strip it
    best = strip_uuid_prefix(best)
    return best[:max_chars].strip() or "Untitled document"


def display_title(title: str | None, filename: str | None = None) -> str:
    """Safe title for API/UI for already-stored papers."""
    if title and not is_poor_title(title):
        cleaned = strip_uuid_prefix(title)
        if cleaned and not is_poor_title(cleaned):
            return cleaned
        # Title was poor only because of UUID prefix
        if cleaned and score_title_candidate(cleaned) >= 0:
            return cleaned
    return resolve_paper_title(metadata_title=title, filename=filename)


def display_authors_json(authors_json: str | None) -> list[str]:
    """Parse authors JSON and drop device/placeholder names."""
    import json

    if not authors_json:
        return []
    try:
        val = json.loads(authors_json)
        if isinstance(val, list):
            return clean_authors([str(a) for a in val])
    except (json.JSONDecodeError, TypeError):
        pass
    # Fallback plain split
    parts = re.split(r"\s*[,;]\s*", authors_json.strip("[]\"' "))
    return clean_authors(parts)
