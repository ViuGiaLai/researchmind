"""Anonymization Engine — Core logic.

Pipeline:
    raw_text
        ↓  detect_entities()   — Regex + heuristic NER
        ↓  build_map()         — entity → [TYPE_N] label
        ↓  apply_map()         — substitute in text
    anonymized_text + EntityMap

Thiết kế:
- Offline, không cần internet, không cần model NLP ngoài.
- Reversible: EntityMap lưu trong SQLite, có thể deanonymize bất cứ lúc nào.
- Deterministic: Cùng text + cùng map → cùng kết quả.
- Scope: Hoạt động trên text thuần (Markdown). Frontend và AI Chat sử dụng
  bản anonymized khi người dùng bật chế độ ẩn danh.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from loguru import logger

# ─── Entity Types ─────────────────────────────────────────────────

ENTITY_TYPES = {
    "AUTHOR": "AUTHOR",
    "INSTITUTION": "INSTITUTION",
    "EMAIL": "EMAIL",
    "GRANT": "GRANT",
    "PROJECT": "PROJECT",
    "ORCID": "ORCID",
    "DOI_AUTHOR": "DOI_AUTHOR",
}


# ─── Patterns ─────────────────────────────────────────────────────

# Họ tên người (Tây & Việt): "John A. Smith", "Nguyễn Văn An", "J. Smith"
AUTHOR_PATTERNS = [
    # Standard Western name patterns in academic context
    r"(?<![A-Za-z])([A-Z][a-z]{1,14}(?:\s[A-Z]\.)?(?:\s[A-Z][a-z]{1,20}){1,3})(?=\s*[,;⁰¹²³⁴⁵⁶⁷⁸⁹\*†‡§¶#]|\s+and\s|\s+&\s|\s+from\s|\s+at\s|\s*\n)",
    # Vietnamese names: Họ Tên (3-4 words, first word uppercase)
    r"(?<![A-Za-z])([A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ][a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]{1,12}(?:\s[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ][a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]{1,12}){2,3})(?=\s*[,;⁰¹²³⁴⁵⁶⁷⁸⁹\*†‡§¶#]|\s+and\s|\s+&\s|\s+from\s|\s+at\s|\s*\n)",
]

# Tên tổ chức / trường đại học / viện nghiên cứu
INSTITUTION_PATTERNS = [
    # University / Institute / College / Department / Laboratory / Lab / School of
    r"(?:(?:University|Institut(?:e|o)?|College|Department|Dept\.|Laboratory|Lab|School)\s+of\s+[A-Z][A-Za-z\s,]+?)(?=[,;\n])",
    r"(?:[A-Z][A-Za-z]+\s+University(?:\s+of\s+[A-Z][A-Za-z\s]+?)?)(?=[,;\n])",
    r"(?:[A-Z][A-Za-z]+\s+Institute\s+of\s+[A-Z][A-Za-z\s]+?)(?=[,;\n])",
    r"(?:National\s+University\s+of\s+[A-Z][A-Za-z\s]+?)(?=[,;\n])",
    r"(?:Trường\s+Đại\s+học\s+[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐ][A-Za-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ\s]+?)(?=[,;\n])",
    r"(?:Viện\s+[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐ][A-Za-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ\s]+?)(?=[,;\n])",
    # Abbreviations in context like "MIT", "UCLA", "VNU" near affiliation markers
    r"(?:at|from|with|of|,)\s+([A-Z]{2,8})(?=\s*[,;\n])",
]

# Email addresses
EMAIL_PATTERN = r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"

# ORCID
ORCID_PATTERN = r"(?:ORCID:?\s*)?(?:https?://orcid\.org/)?(\d{4}-\d{4}-\d{4}-\d{3}[0-9X])"

# Grant / Funding numbers (must contain at least one digit)
GRANT_PATTERNS = [
    r"(?:Grant|Award|Contract|Project|No\.|Number|#)\s*(?:[:.]?\s*)([A-Z]{0,5}\d[\d\-\/A-Z]{3,20})",
    r"(?:Funded by|Supported by|under grant)\s+((?=[A-Z\-\/]*\d)[A-Z0-9\-\/]{4,30})",
    r"(?:NSF|NIH|NSFC|MOST|NAFOSTED|ANR|DFG|JSPS|EPSRC|ERC)\s*(?:grant\s*)?[#\-]?\s*((?=[A-Z\-\/]*\d)[A-Z0-9\-\/]{4,30})",
]

# Project names (appears after "project", "program", etc.)
PROJECT_PATTERNS = [
    r"(?:(?:the\s+)?(?:project|program|initiative|collaboration|consortium)\s+[\"']?)([A-Z][A-Za-z0-9\s\-]{3,40})(?:[\"']?)",
]


# ─── Data classes ─────────────────────────────────────────────────

@dataclass
class EntityEntry:
    original: str
    label: str          # e.g. "[AUTHOR_1]"
    entity_type: str    # AUTHOR | INSTITUTION | EMAIL | ...
    count: int = 0      # How many times replaced


@dataclass
class AnonymizationResult:
    anonymized_text: str
    entity_map: dict[str, EntityEntry]   # original → entry
    label_map: dict[str, str]            # label → original (for deanonymization)
    stats: dict[str, int] = field(default_factory=dict)

    def to_json(self) -> str:
        """Serialize entity map for SQLite storage."""
        data = {
            original: {
                "label": entry.label,
                "entity_type": entry.entity_type,
                "count": entry.count,
            }
            for original, entry in self.entity_map.items()
        }
        return json.dumps(data, ensure_ascii=False)

    @classmethod
    def from_json(cls, json_str: str, anonymized_text: str) -> AnonymizationResult:
        """Deserialize from SQLite storage."""
        data = json.loads(json_str)
        entity_map: dict[str, EntityEntry] = {}
        label_map: dict[str, str] = {}
        for original, info in data.items():
            entry = EntityEntry(
                original=original,
                label=info["label"],
                entity_type=info["entity_type"],
                count=info.get("count", 0),
            )
            entity_map[original] = entry
            label_map[info["label"]] = original
        return cls(
            anonymized_text=anonymized_text,
            entity_map=entity_map,
            label_map=label_map,
        )


# ─── Engine ───────────────────────────────────────────────────────

class AnonymizationEngine:
    """
    Stateless engine. Gọi anonymize() để xử lý một đoạn văn bản.
    Kết quả bao gồm text đã ẩn danh + entity map để reverse.

    Usage:
        engine = AnonymizationEngine()
        result = engine.anonymize(text)
        restored = engine.deanonymize(result.anonymized_text, result.label_map)
    """

    def __init__(self, aggressive: bool = False):
        """
        aggressive: Nếu True, cố gắng nhận diện thêm nhiều tên người hơn
                    (có thể gây false positives ở mode thông thường).
        """
        self.aggressive = aggressive
        self._email_re = re.compile(EMAIL_PATTERN, re.IGNORECASE)
        self._orcid_re = re.compile(ORCID_PATTERN, re.IGNORECASE)
        self._grant_res = [re.compile(p, re.IGNORECASE) for p in GRANT_PATTERNS]
        self._project_res = [re.compile(p, re.IGNORECASE) for p in PROJECT_PATTERNS]
        # Author patterns compiled với MULTILINE
        self._author_res = [re.compile(p, re.MULTILINE) for p in AUTHOR_PATTERNS]
        self._institution_res = [re.compile(p, re.MULTILINE | re.IGNORECASE) for p in INSTITUTION_PATTERNS]

    # ─── Public API ───────────────────────────────────────────────

    def anonymize(self, text: str, existing_map: dict[str, EntityEntry] | None = None) -> AnonymizationResult:
        """
        Anonymize text. Nếu có existing_map (từ lần xử lý trước), reuse labels.

        Args:
            text: Raw text (Markdown hoặc plain text).
            existing_map: Entity map từ lần anonymize trước (để consistency).

        Returns:
            AnonymizationResult với text đã ẩn danh và entity map.
        """
        entity_map: dict[str, EntityEntry] = dict(existing_map) if existing_map else {}
        label_map: dict[str, str] = {e.label: orig for orig, e in entity_map.items()}
        counters: dict[str, int] = {}
        for e in entity_map.values():
            t = e.entity_type
            n = int(e.label.split("_")[-1].rstrip("]"))
            counters[t] = max(counters.get(t, 0), n)

        def _next_label(entity_type: str) -> str:
            counters[entity_type] = counters.get(entity_type, 0) + 1
            return f"[{entity_type}_{counters[entity_type]}]"

        def _register(original: str, entity_type: str) -> str:
            """Register entity, return its label."""
            key = original.strip()
            if not key:
                return original
            if key in entity_map:
                entity_map[key].count += 1
                return entity_map[key].label
            label = _next_label(entity_type)
            entry = EntityEntry(original=key, label=label, entity_type=entity_type, count=1)
            entity_map[key] = entry
            label_map[label] = key
            return label

        # 1. Emails (most specific → first)
        processed = self._replace_pattern(text, self._email_re, "EMAIL", _register, group=0)

        # 2. ORCID
        processed = self._replace_pattern(processed, self._orcid_re, "ORCID", _register, group=0)

        # 3. Grant numbers
        for gr in self._grant_res:
            processed = self._replace_by_match(processed, gr, "GRANT", _register)

        # 4. Project names
        for pr in self._project_res:
            processed = self._replace_by_match(processed, pr, "PROJECT", _register)

        # 5. Institutions (before authors to avoid partial overlap)
        for ir in self._institution_res:
            processed = self._replace_by_match(processed, ir, "INSTITUTION", _register)

        # 6. Author names — context-aware (only in header/affiliation sections)
        processed = self._detect_and_replace_authors(processed, _register)

        # Count stats
        stats = {
            etype: sum(1 for e in entity_map.values() if e.entity_type == etype)
            for etype in ENTITY_TYPES
        }

        logger.debug(
            f"Anonymization complete: {sum(stats.values())} entities found "
            f"({stats})"
        )

        return AnonymizationResult(
            anonymized_text=processed,
            entity_map=entity_map,
            label_map=label_map,
            stats=stats,
        )

    def deanonymize(self, anonymized_text: str, label_map: dict[str, str]) -> str:
        """
        Khôi phục text gốc từ text đã ẩn danh.

        Args:
            anonymized_text: Text đã được anonymize.
            label_map: Mapping label → original (từ AnonymizationResult.label_map).

        Returns:
            Text đã khôi phục về gốc.
        """
        result = anonymized_text
        # Sort by label length DESC để tránh partial replacement
        for label, original in sorted(label_map.items(), key=lambda x: -len(x[0])):
            result = result.replace(label, original)
        return result

    def merge_with_paper_metadata(
        self,
        result: AnonymizationResult,
        title: str,
        authors: list[str],
        doi: str = "",
    ) -> AnonymizationResult:
        """
        Thêm thông tin tác giả từ metadata vào entity map (nếu chưa có).
        Đảm bảo metadata paper cũng được ẩn danh nhất quán.
        """
        # Fake register to reuse existing label
        entity_map = result.entity_map
        label_map = result.label_map

        counters: dict[str, int] = {}
        for e in entity_map.values():
            t = e.entity_type
            n_str = e.label.split("_")[-1].rstrip("]")
            if n_str.isdigit():
                counters[t] = max(counters.get(t, 0), int(n_str))

        for author in authors:
            name = author.strip()
            if not name or name in entity_map:
                continue
            counters["AUTHOR"] = counters.get("AUTHOR", 0) + 1
            label = f"[AUTHOR_{counters['AUTHOR']}]"
            entry = EntityEntry(original=name, label=label, entity_type="AUTHOR", count=0)
            entity_map[name] = entry
            label_map[label] = name

        return AnonymizationResult(
            anonymized_text=result.anonymized_text,
            entity_map=entity_map,
            label_map=label_map,
            stats=result.stats,
        )

    # ─── Private helpers ──────────────────────────────────────────

    def _replace_pattern(
        self,
        text: str,
        pattern: re.Pattern,
        entity_type: str,
        register_fn,
        group: int = 0,
    ) -> str:
        """Replace all matches of a compiled pattern."""
        def replacer(m: re.Match) -> str:
            matched = m.group(group)
            label = register_fn(matched, entity_type)
            # Preserve surrounding text not in the group
            if group == 0:
                if "[" in matched or "]" in matched:
                    return matched
                return label
            start, end = m.span(group)
            rel_start = start - m.start()
            rel_end = end - m.start()
            full = m.group(0)
            return full[:rel_start] + label + full[rel_end:]
        return pattern.sub(replacer, text)

    def _replace_by_match(
        self,
        text: str,
        pattern: re.Pattern,
        entity_type: str,
        register_fn,
    ) -> str:
        """Replace first capture group (group 1) in pattern, keep rest."""
        def replacer(m: re.Match) -> str:
            try:
                matched = m.group(1)
            except IndexError:
                matched = m.group(0)
            if not matched or "[" in matched or "]" in matched:
                # Already anonymized or partial label
                return m.group(0)
            label = register_fn(matched, entity_type)
            full = m.group(0)
            return full.replace(matched, label, 1)
        return pattern.sub(replacer, text)

    def _detect_and_replace_authors(self, text: str, register_fn) -> str:
        """
        Phát hiện tên tác giả theo ngữ cảnh.
        Chiến lược: Chỉ tìm trong phần header của paper (200 dòng đầu)
        để giảm false positives từ phần thân paper.
        """
        lines = text.split("\n")
        # Header zone: ~first 30% của document hoặc tối đa 100 dòng
        header_end = min(100, max(30, len(lines) // 3))

        # Tìm section "Authors" hoặc "Abstract" để xác định ranh giới
        for i, line in enumerate(lines[:150]):
            stripped = line.strip().lower()
            if any(kw in stripped for kw in ["abstract", "introduction", "keywords", "1.", "i."]):
                header_end = min(header_end, i + 5)
                break

        header = "\n".join(lines[:header_end])
        body = "\n".join(lines[header_end:])

        # Áp dụng author patterns chỉ cho phần header
        for ar in self._author_res:
            header = self._replace_by_match(header, ar, "AUTHOR", register_fn)

        # Trong body: chỉ replace các tên đã được detect ở header
        # (không thêm tên mới từ body để tránh false positives)
        # Việc này sẽ xảy ra tự nhiên khi deanonymize — không cần xử lý body

        return header + ("\n" if lines[header_end:] else "") + body
