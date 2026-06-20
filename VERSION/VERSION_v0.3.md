# ResearchMind VN — v0.3 Technical Spec

> **Cập nhật đối chiếu code — 19/06/2026:** v0.3 đã được code vượt spec ban đầu ở một số điểm và thiếu ở một số điểm khác:
>
> - Verify Mode hiện kết hợp **Local RAG + OpenAlex + Crossref + Semantic Scholar**, không chỉ OpenAlex/Crossref.
> - Verify đã có cả non-stream và streaming qua `POST /api/verify` với `stream: true`.
> - Academic cache dùng file SQLite riêng `settings.data_dir / "academic_cache.db"`, không phải SQLAlchemy model `AcademicCache`.
> - Không có `CitationBadge.tsx`; badge external source được render trực tiếp trong `VerifyPanel.tsx`.
> - `api.ts` không có hàm `callVerify()` đúng như spec; code hiện tại dùng `api.verify()` và `api.verifyStream()`.
> - Background enrichment sau import đã có trong `routers/papers.py` cho import file/folder; Zotero SQLite sync có logic indexing riêng và chưa đồng bộ hoàn toàn cùng enrichment path.
> - Semantic Scholar đã được thêm ở v0.3, nên các mục “không làm Semantic Scholar / làm v0.4” trong spec cũ đã lỗi thời.
> - Cache invalidation endpoint `DELETE /api/academic/cache/{doi}` chưa được code.

> **Triết lý:** v0.1 = feature · v0.2 = nhanh + mượt · v0.3 = AI trả lời ĐÚNG + có chứng cứ
>
> **Điều kiện bắt đầu:** v0.2 hoàn thành ✅ · main.py đã split thành routers/ ✅
>
> **Ngày tạo:** 18/06/2026

---

## Mục lục

1. [Tổng quan v0.3](#1-tổng-quan)
2. [Kiến trúc 3 tầng](#2-kiến-trúc-3-tầng)
3. [File structure thay đổi](#3-file-structure-thay-đổi)
4. [Phase 1 — Academic Clients](#4-phase-1--academic-clients)
5. [Phase 2 — DOI Extraction Pipeline](#5-phase-2--doi-extraction-pipeline)
6. [Phase 3 — Verify Mode Backend](#6-phase-3--verify-mode-backend)
7. [Phase 4 — Verify Mode Frontend](#7-phase-4--verify-mode-frontend)
8. [Phase 5 — Background Enrichment](#8-phase-5--background-enrichment)
9. [Error Handling & Degraded Mode](#9-error-handling--degraded-mode)
10. [Caching Strategy](#10-caching-strategy)
11. [Định nghĩa "v0.3 Done"](#11-định-nghĩa-v03-done)
12. [Thứ tự implement](#12-thứ-tự-implement)

---

## 1. Tổng quan

### Mục tiêu duy nhất của v0.3

Khi user hỏi về một paper, ResearchMind phải trả lời được:
- Paper này được cộng đồng khoa học đánh giá thế nào? (citation count)
- Có ai phản bác kết luận này không? (papers citing with disagreement)
- Có nghiên cứu mới hơn liên quan không? (related works)
- Metadata có đúng không? (author, journal, year — từ Crossref)

### Những gì KHÔNG làm ở v0.3

| Tính năng | Lý do bỏ |
|---|---|
| Semantic Scholar | Đã được code trong v0.3 hiện tại để bổ sung citation/influential citation/recommendations |
| Retraction Watch | Rate limit + phí, làm v0.4 |
| arXiv API riêng | OpenAlex đã index arXiv papers |
| Full Deep Research mode | Quá nặng, dễ timeout |
| Unpaywall | Nice-to-have, không phải core v0.3 |

### So sánh trước/sau

```
v0.2:  User → Local RAG → LLM → Answer
v0.3 hiện tại:  User → Local RAG + OpenAlex + Crossref + Semantic Scholar → LLM → Answer có chứng cứ
```

---

## 2. Kiến trúc 3 tầng

```
┌──────────────────────────────────────────────────────────────┐
│  Tầng 3: LLM Reasoning                                        │
│  NVIDIA · FreeModel · Groq · Gemini · llama-server · Claude         │
│  → AI chỉ viết báo cáo, KHÔNG phải nguồn sự thật             │
└───────────────────────────────────┬──────────────────────────┘
                                    │ context đã verified
┌───────────────────────────────────▼──────────────────────────┐
│  Tầng 2: Academic Knowledge (MỚI ở v0.3)                     │
│                                                               │
│  OpenAlex ──── citation count, related works, cited_by        │
│  Crossref  ──── metadata chuẩn, DOI validation               │
│  Semantic Scholar ─ citation count, influential citations,    │
│                     citations, recommendations                │
│                                                               │
│  → Chạy parallel, timeout 5s, cache 24h                      │
└───────────────────────────────────┬──────────────────────────┘
                                    │ context local
┌───────────────────────────────────▼──────────────────────────┐
│  Tầng 1: Local Knowledge (từ v0.1)                           │
│  ChromaDB · SQLite FTS5 · bge-m3 · Cross-encoder             │
│  → Hybrid search trên tài liệu user đã import                │
└──────────────────────────────────────────────────────────────┘
```

### Luồng Verify Mode (chi tiết)

```
User gửi query + chọn Verify Mode
        │
        ▼
[1] Local RAG retrieve (top_k=5)
        │
        ▼
[2] DOI Extraction từ PDF metadata (PyMuPDF)
    Fallback chain nếu không có trong metadata:
      → Regex extract từ context text
      → Crossref title-search
        │
        ▼
[3] Parallel external lookup (asyncio.gather, timeout=5s mỗi call)
    ├── OpenAlex: citation_count + related_works + cited_by_recent
    ├── Crossref: author + journal + year validation
    └── Semantic Scholar: citation_count + influential citations + recommendations
        │
        ▼
[4] Build verify context (local chunks + external data)
        │
        ▼
[5] LLM generate với verify prompt (có citation bắt buộc)
        │
        ▼
[6] Response: answer + citations + external_sources panel
```

---

## 3. File Structure Thay Đổi

Chỉ thêm, không sửa file cũ (trừ 2 file cần patch nhỏ).

```
backend/
├── routers/                    ← đã có từ v0.2
│   ├── chat.py
│   ├── papers.py
│   ├── insights.py
│   └── academic.py             ← MỚI: 2 endpoints GET
│
├── academic/                   ← MỚI: toàn bộ folder này
│   ├── __init__.py
│   ├── openalex.py             ← OpenAlex API client
│   ├── crossref.py             ← Crossref API client
│   ├── semantic_scholar.py     ← Semantic Scholar API client
│   ├── doi_extractor.py        ← DOI extraction pipeline
│   ├── cache.py                ← SQLite-based cache 24h
│   └── context_builder.py     ← Ghép local + external context
│
├── routers/
│   └── verify.py               ← MỚI: POST /api/verify endpoint
│
├── main.py                     ← PATCH: include router mới
└── db/
    └── models.py               ← Không có AcademicCache ORM; cache academic dùng SQLite file riêng

frontend/
├── components/
│   └── chat/
│       ├── ChatView.tsx        ← PATCH: thêm verify mode tab
│       └── VerifyPanel.tsx     ← MỚI: hiển thị external sources + badges trực tiếp
└── lib/
    └── api.ts                  ← PATCH: thêm api.verify() + api.verifyStream()
```

---

## 4. Phase 1 — Academic Clients

### 4.1 `backend/academic/openalex.py`

```python
"""
OpenAlex API client — không cần API key, rate limit 100k/ngày.
Polite pool: thêm email vào header để tăng rate limit.
"""
import asyncio
import httpx
from dataclasses import dataclass
from typing import Optional

OPENALEX_BASE = "https://api.openalex.org"
POLITE_EMAIL = "researchmind@yourdomain.com"  # thay bằng email thật

HEADERS = {
    "User-Agent": f"ResearchMindVN/0.3 (mailto:{POLITE_EMAIL})"
}


@dataclass
class OpenAlexWork:
    openalex_id: str
    doi: Optional[str]
    title: str
    publication_year: Optional[int]
    citation_count: int
    related_work_ids: list[str]      # OpenAlex IDs
    referenced_work_ids: list[str]   # Papers mà paper này cite
    recent_citing_works: list[dict]  # Papers mới cite paper này (top 5)


async def get_work_by_doi(doi: str, timeout: float = 5.0) -> Optional[OpenAlexWork]:
    """
    Tra paper theo DOI.
    DOI format: '10.xxxx/yyyy' (không cần https://doi.org/ prefix)
    """
    doi_clean = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works/doi:{doi_clean}",
                headers=HEADERS
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            return _parse_work(data)
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def get_work_by_title(title: str, timeout: float = 5.0) -> Optional[OpenAlexWork]:
    """
    Fallback khi không có DOI — tìm theo title.
    Trả về kết quả khớp nhất (relevance score cao nhất).
    """
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "filter": f"title.search:{title}",
                    "per_page": 1,
                    "sort": "relevance_score:desc"
                },
                headers=HEADERS
            )
            if resp.status_code != 200:
                return None
            results = resp.json().get("results", [])
            if not results:
                return None
            return _parse_work(results[0])
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def get_recent_citing_works(
    openalex_id: str,
    since_year: int = 2022,
    limit: int = 5,
    timeout: float = 5.0
) -> list[dict]:
    """
    Lấy các paper mới nhất đang cite paper này.
    Dùng để check: có ai phản bác / cập nhật không?
    """
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{OPENALEX_BASE}/works",
                params={
                    "filter": f"cites:{openalex_id},publication_year:>{since_year}",
                    "per_page": limit,
                    "sort": "publication_date:desc",
                    "select": "id,doi,title,publication_year,authorships,primary_location"
                },
                headers=HEADERS
            )
            if resp.status_code != 200:
                return []
            return resp.json().get("results", [])
        except (httpx.TimeoutException, httpx.RequestError):
            return []


def _parse_work(data: dict) -> OpenAlexWork:
    return OpenAlexWork(
        openalex_id=data.get("id", ""),
        doi=data.get("doi"),
        title=data.get("title", ""),
        publication_year=data.get("publication_year"),
        citation_count=data.get("cited_by_count", 0),
        related_work_ids=data.get("related_works", []),
        referenced_work_ids=data.get("referenced_works", []),
        recent_citing_works=[]  # fill riêng bằng get_recent_citing_works()
    )
```

---

### 4.2 `backend/academic/crossref.py`

```python
"""
Crossref API client — miễn phí, polite pool với email.
Dùng để: validate DOI, lấy metadata chuẩn (author, journal, year).
"""
import httpx
from dataclasses import dataclass
from typing import Optional

CROSSREF_BASE = "https://api.crossref.org"
POLITE_EMAIL = "researchmind@yourdomain.com"

HEADERS = {
    "User-Agent": f"ResearchMindVN/0.3 (mailto:{POLITE_EMAIL})"
}


@dataclass
class CrossrefWork:
    doi: str
    title: str
    authors: list[str]       # ["Nguyen Van A", "Tran Thi B"]
    journal: Optional[str]
    year: Optional[int]
    publisher: Optional[str]
    citation_count: int
    is_valid: bool           # DOI có tồn tại và match không?


async def get_work_by_doi(doi: str, timeout: float = 5.0) -> Optional[CrossrefWork]:
    """
    Validate DOI + lấy metadata.
    Trả về None nếu DOI không tồn tại hoặc timeout.
    """
    doi_clean = doi.replace("https://doi.org/", "").strip()

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{CROSSREF_BASE}/works/{doi_clean}",
                headers=HEADERS
            )
            if resp.status_code == 404:
                return CrossrefWork(
                    doi=doi_clean, title="", authors=[], journal=None,
                    year=None, publisher=None, citation_count=0, is_valid=False
                )
            if resp.status_code != 200:
                return None

            item = resp.json().get("message", {})
            return _parse_item(item)
        except (httpx.TimeoutException, httpx.RequestError):
            return None


async def find_doi_by_title(title: str, authors: list[str] = None, timeout: float = 5.0) -> Optional[str]:
    """
    Fallback: tìm DOI từ title + authors.
    Trả về DOI string nếu confidence score >= 0.95, None nếu không chắc.
    """
    query = title
    if authors:
        query += " " + " ".join(authors[:2])

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(
                f"{CROSSREF_BASE}/works",
                params={"query": query, "rows": 1, "select": "DOI,score,title"},
                headers=HEADERS
            )
            if resp.status_code != 200:
                return None

            items = resp.json().get("message", {}).get("items", [])
            if not items:
                return None

            top = items[0]
            # Crossref trả về relevance score — chỉ lấy khi rất chắc
            if top.get("score", 0) >= 60.0:  # score > 60 = high confidence
                return top.get("DOI")
            return None
        except (httpx.TimeoutException, httpx.RequestError):
            return None


def _parse_item(item: dict) -> CrossrefWork:
    # Authors
    authors = []
    for auth in item.get("author", []):
        given = auth.get("given", "")
        family = auth.get("family", "")
        name = f"{given} {family}".strip()
        if name:
            authors.append(name)

    # Journal name
    container = item.get("container-title", [])
    journal = container[0] if container else None

    # Year
    year = None
    date_parts = item.get("published", {}).get("date-parts", [[]])
    if date_parts and date_parts[0]:
        year = date_parts[0][0]

    # Title
    titles = item.get("title", [])
    title = titles[0] if titles else ""

    return CrossrefWork(
        doi=item.get("DOI", ""),
        title=title,
        authors=authors,
        journal=journal,
        year=year,
        publisher=item.get("publisher"),
        citation_count=item.get("is-referenced-by-count", 0),
        is_valid=True
    )
```

---

## 5. Phase 2 — DOI Extraction Pipeline

### 5.1 `backend/academic/doi_extractor.py`

```python
"""
DOI Extraction với fallback chain 4 bước.
Ưu tiên: PDF metadata > regex text > Crossref title search > bỏ qua.

DOI đã có trong PDF metadata (PyMuPDF) — đây là happy path chính.
"""
import re
import fitz  # PyMuPDF
from typing import Optional
from .crossref import find_doi_by_title

# Pattern bắt DOI chuẩn theo CrossRef spec
DOI_PATTERN = re.compile(
    r'\b(10\.\d{4,}(?:\.\d+)*\/(?:(?!["&\'<>])\S)+)\b',
    re.IGNORECASE
)


async def extract_doi_from_paper(
    pdf_path: Optional[str] = None,
    title: Optional[str] = None,
    authors: Optional[list[str]] = None,
    context_text: Optional[str] = None
) -> Optional[str]:
    """
    Fallback chain:
    1. PDF metadata (nhanh nhất, không cần network)
    2. Regex trên context_text (từ RAG retrieval)
    3. Crossref title search (cần network, ~0.5s)
    4. Trả về None → xử lý gracefully ở caller
    """

    # Bước 1: PDF metadata
    if pdf_path:
        doi = _extract_from_pdf_metadata(pdf_path)
        if doi:
            return _clean_doi(doi)

    # Bước 2: Regex trên text
    if context_text:
        doi = _extract_from_text(context_text)
        if doi:
            return _clean_doi(doi)

    # Bước 3: Crossref title search
    if title:
        doi = await find_doi_by_title(title, authors)
        if doi:
            return _clean_doi(doi)

    return None


def _extract_from_pdf_metadata(pdf_path: str) -> Optional[str]:
    """
    PyMuPDF đọc metadata — field 'subject' hoặc 'keywords' thường chứa DOI.
    Một số publisher đặt DOI trực tiếp vào 'doi' field (non-standard).
    """
    try:
        doc = fitz.open(pdf_path)
        meta = doc.metadata or {}
        doc.close()

        # Check các field metadata phổ biến chứa DOI
        for field in ["subject", "keywords", "doi", "identifier"]:
            value = meta.get(field, "")
            if value:
                match = DOI_PATTERN.search(value)
                if match:
                    return match.group(1)

        return None
    except Exception:
        return None


def _extract_from_text(text: str) -> Optional[str]:
    """
    Tìm DOI pattern trong đoạn text — thường nằm ở đầu paper
    hoặc trong references section.
    """
    # Giới hạn search 2000 ký tự đầu (abstract/intro thường có DOI)
    search_zone = text[:2000]
    match = DOI_PATTERN.search(search_zone)
    if match:
        return match.group(1)

    # Nếu không có ở đầu, thử toàn bộ text
    match = DOI_PATTERN.search(text)
    return match.group(1) if match else None


def _clean_doi(doi: str) -> str:
    """Normalize DOI: lowercase, strip prefix."""
    doi = doi.strip()
    doi = re.sub(r'^https?://doi\.org/', '', doi)
    return doi.lower()


def extract_multiple_dois(context_text: str) -> list[str]:
    """
    Trích xuất tất cả DOI trong context — dùng khi chat về nhiều paper.
    Dedup và trả về list.
    """
    matches = DOI_PATTERN.findall(context_text)
    seen = set()
    result = []
    for doi in matches:
        cleaned = _clean_doi(doi)
        if cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result
```

---

## 6. Phase 3 — Verify Mode Backend

### 6.1 `backend/academic/context_builder.py`

```python
"""
Ghép local RAG context với external academic data thành 1 prompt context.
LLM nhận context này để generate câu trả lời có chứng cứ.
"""
from dataclasses import dataclass
from typing import Optional
from .openalex import OpenAlexWork
from .crossref import CrossrefWork


@dataclass
class ExternalPaperData:
    doi: str
    title: str
    openalex: Optional[OpenAlexWork]
    crossref: Optional[CrossrefWork]
    recent_citing: list[dict]  # từ OpenAlex


def build_verify_context(
    local_context: str,
    external_data: list[ExternalPaperData]
) -> str:
    """
    Tạo combined context cho LLM khi chạy Verify Mode.
    Format rõ ràng để LLM biết nguồn nào là local, nguồn nào là external.
    """
    sections = []

    # Phần 1: Local knowledge
    sections.append(
        "=== TÀI LIỆU CỦA NGƯỜI DÙNG (Local) ===\n"
        + local_context
    )

    # Phần 2: External academic data
    if external_data:
        ext_sections = []
        for ep in external_data:
            block = _format_external_paper(ep)
            if block:
                ext_sections.append(block)

        if ext_sections:
            sections.append(
                "=== DỮ LIỆU HỌC THUẬT BÊN NGOÀI (OpenAlex + Crossref) ===\n"
                + "\n\n".join(ext_sections)
            )
    else:
        sections.append(
            "=== DỮ LIỆU HỌC THUẬT BÊN NGOÀI ===\n"
            "Không tìm được dữ liệu external cho các paper trong ngữ cảnh này."
        )

    return "\n\n".join(sections)


def _format_external_paper(ep: ExternalPaperData) -> str:
    lines = []

    # Header
    title = ep.title or ep.doi
    lines.append(f"[PAPER: {title}]")
    lines.append(f"DOI: {ep.doi}")

    # Crossref metadata
    if ep.crossref and ep.crossref.is_valid:
        cr = ep.crossref
        if cr.authors:
            lines.append(f"Tác giả: {', '.join(cr.authors[:3])}"
                         + (" et al." if len(cr.authors) > 3 else ""))
        if cr.journal:
            lines.append(f"Tạp chí: {cr.journal}")
        if cr.year:
            lines.append(f"Năm: {cr.year}")
        lines.append(f"Citations (Crossref): {cr.citation_count}")

    # OpenAlex data
    if ep.openalex:
        oa = ep.openalex
        lines.append(f"Citations (OpenAlex): {oa.citation_count}")
        lines.append(f"Số paper liên quan: {len(oa.related_work_ids)}")

    # Recent citing papers (quan trọng nhất cho verify)
    if ep.recent_citing:
        lines.append(f"\nCác nghiên cứu gần đây (từ 2022) trích dẫn paper này:")
        for i, work in enumerate(ep.recent_citing[:5], 1):
            r_title = work.get("title", "Unknown")
            r_year = work.get("publication_year", "?")
            r_doi = work.get("doi", "")
            lines.append(f"  {i}. {r_title} ({r_year})"
                         + (f" — doi:{r_doi}" if r_doi else ""))

    return "\n".join(lines)


VERIFY_SYSTEM_PROMPT = """Bạn là trợ lý nghiên cứu học thuật của ResearchMind VN.

Bạn được cung cấp:
1. Nội dung từ tài liệu người dùng đã import (Local knowledge)
2. Dữ liệu học thuật từ OpenAlex và Crossref (External verified data)

Quy tắc BẮT BUỘC khi trả lời:
- Mọi claim phải có nguồn rõ ràng: [Local PDF], [OpenAlex], hoặc [Crossref]
- Nếu external data mâu thuẫn với local document → nêu rõ sự mâu thuẫn
- Nếu không có external data → nói rõ "chỉ dựa trên tài liệu local"
- KHÔNG được suy đoán thông tin không có trong context
- Trả lời bằng tiếng Việt, thuật ngữ kỹ thuật giữ nguyên tiếng Anh

Cấu trúc câu trả lời Verify Mode:
1. Kết luận chính (1-2 câu)
2. Bằng chứng ủng hộ (nếu có)
3. Bằng chứng phản bác hoặc cập nhật (nếu có) — đánh dấu ⚠️
4. Nguồn tham khảo (liệt kê có DOI)
"""
```

### 6.2 `backend/academic/cache.py`

```python
"""
SQLite-based cache cho external API calls.
TTL: 24h cho OpenAlex, 7 ngày cho Crossref (metadata ít thay đổi).
Không dùng Redis để giữ local-first.
"""
import json
import time
import sqlite3
from pathlib import Path
from typing import Optional

CACHE_DB_PATH = Path("data/academic_cache.db")

# TTL tính bằng giây
TTL_OPENALEX = 24 * 3600      # 24 giờ (citation count thay đổi)
TTL_CROSSREF = 7 * 24 * 3600  # 7 ngày (metadata stable)


def _get_conn() -> sqlite3.Connection:
    CACHE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(CACHE_DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS academic_cache (
            cache_key   TEXT PRIMARY KEY,
            source      TEXT NOT NULL,
            data        TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_source ON academic_cache(source)")
    conn.commit()
    return conn


def cache_get(key: str, ttl: int) -> Optional[dict]:
    """Trả về dict nếu cache còn hiệu lực, None nếu miss hoặc expired."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT data, created_at FROM academic_cache WHERE cache_key = ?",
        (key,)
    ).fetchone()
    conn.close()

    if not row:
        return None
    data_str, created_at = row
    if time.time() - created_at > ttl:
        return None  # expired, caller sẽ fetch mới
    return json.loads(data_str)


def cache_set(key: str, source: str, data: dict) -> None:
    """Lưu vào cache. source = 'openalex' hoặc 'crossref'."""
    conn = _get_conn()
    conn.execute(
        """INSERT OR REPLACE INTO academic_cache
           (cache_key, source, data, created_at) VALUES (?, ?, ?, ?)""",
        (key, source, json.dumps(data, ensure_ascii=False), int(time.time()))
    )
    conn.commit()
    conn.close()


def cache_invalidate_doi(doi: str) -> None:
    """Xóa cache của 1 DOI — dùng khi user manually refresh."""
    conn = _get_conn()
    conn.execute(
        "DELETE FROM academic_cache WHERE cache_key LIKE ?",
        (f"%{doi}%",)
    )
    conn.commit()
    conn.close()
```

### 6.3 `backend/routers/verify.py`

> Cap nhat 19/06/2026: snippet duoi day la thiet ke ban dau. Code hien tai da mo rong them Semantic Scholar, helper deserialize cache, `api.verifyStream()`, va tranh tao coroutine fetch khi cache hit. Khi sua code that, dung `backend/routers/verify.py` hien tai lam nguon chuan.

```python
"""
POST /api/verify — Verify Mode endpoint.
Kết hợp Local RAG (Tầng 1) + OpenAlex + Crossref (Tầng 2) + LLM (Tầng 3).
"""
import asyncio
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..academic.openalex import get_work_by_doi, get_work_by_title, get_recent_citing_works
from ..academic.crossref import get_work_by_doi as crossref_get_work
from ..academic.doi_extractor import extract_doi_from_paper, extract_multiple_dois
from ..academic.context_builder import (
    build_verify_context, ExternalPaperData, VERIFY_SYSTEM_PROMPT
)
from ..academic.cache import cache_get, cache_set, TTL_OPENALEX, TTL_CROSSREF

router = APIRouter(prefix="/api/verify", tags=["verify"])


class VerifyRequest(BaseModel):
    message: str
    paper_ids: list[str] = []       # SQLite paper IDs để retrieve
    session_id: Optional[str] = None


class VerifyResponse(BaseModel):
    answer: str
    citations: list[dict]           # local citations từ RAG
    external_sources: list[dict]    # OpenAlex + Crossref data
    model_used: str
    verify_status: str              # "full" | "partial" | "local_only"


@router.post("", response_model=VerifyResponse)
async def verify_research(request: VerifyRequest = Body(...)):
    from ..main import state  # import state từ app

    if not request.message:
        raise HTTPException(400, "message không được để trống")

    # ── Bước 1: Local RAG retrieve ─────────────────────────────
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=request.message,
        paper_ids=request.paper_ids,
        top_k=5
    )

    # ── Bước 2: Extract DOIs từ context ────────────────────────
    # Lấy pdf_path và title từ paper metadata trong DB
    papers_meta = await asyncio.to_thread(
        _get_papers_metadata, request.paper_ids, state.db_session
    )

    dois_to_lookup = []
    for paper in papers_meta:
        doi = await extract_doi_from_paper(
            pdf_path=paper.get("file_path"),
            title=paper.get("title"),
            authors=paper.get("authors", []),
            context_text=retrieval.context_text
        )
        if doi:
            dois_to_lookup.append((doi, paper.get("title", "")))

    # Cũng extract từ context text (bắt DOI trong nội dung paper)
    extra_dois = extract_multiple_dois(retrieval.context_text)
    for doi in extra_dois:
        if doi not in [d for d, _ in dois_to_lookup]:
            dois_to_lookup.append((doi, ""))

    # ── Bước 3: Parallel external lookup ───────────────────────
    external_data = []
    verify_status = "local_only"

    if dois_to_lookup:
        tasks = [_lookup_paper(doi, title) for doi, title in dois_to_lookup[:3]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, ExternalPaperData):
                external_data.append(result)

        if external_data:
            has_full = any(
                ep.openalex is not None and ep.crossref is not None
                for ep in external_data
            )
            verify_status = "full" if has_full else "partial"

    # ── Bước 4: Build combined context ─────────────────────────
    combined_context = build_verify_context(
        local_context=retrieval.context_text,
        external_data=external_data
    )

    # ── Bước 5: LLM generate ───────────────────────────────────
    generation = await asyncio.to_thread(
        state.generator.generate,
        query=request.message,
        context_text=combined_context,
        system_prompt=VERIFY_SYSTEM_PROMPT  # override system prompt
    )

    # ── Bước 6: Format response ─────────────────────────────────
    external_sources_json = [_serialize_external(ep) for ep in external_data]

    return VerifyResponse(
        answer=generation.text,
        citations=retrieval.citations,
        external_sources=external_sources_json,
        model_used=generation.model_used,
        verify_status=verify_status
    )


async def _lookup_paper(doi: str, fallback_title: str) -> ExternalPaperData:
    """
    Lookup 1 paper từ OpenAlex + Crossref song song.
    Cache-aware. Timeout 5s mỗi source.
    """
    # Check cache trước
    oa_cached = cache_get(f"oa:{doi}", TTL_OPENALEX)
    cr_cached = cache_get(f"cr:{doi}", TTL_CROSSREF)

    # Parallel fetch cho cái chưa có trong cache
    oa_task = (
        asyncio.coroutine(lambda: oa_cached)()
        if oa_cached
        else get_work_by_doi(doi)
    )
    cr_task = (
        asyncio.coroutine(lambda: cr_cached)()
        if cr_cached
        else crossref_get_work(doi)
    )

    oa_result, cr_result = await asyncio.gather(oa_task, cr_task)

    # Fallback OpenAlex: nếu DOI lookup fail, thử title search
    if oa_result is None and fallback_title:
        oa_result = await get_work_by_title(fallback_title)

    # Fetch recent citing papers nếu có OpenAlex result
    recent_citing = []
    if oa_result and oa_result.openalex_id:
        recent_citing = await get_recent_citing_works(
            oa_result.openalex_id, since_year=2022, limit=5
        )

    # Lưu vào cache
    if oa_result:
        cache_set(f"oa:{doi}", "openalex", vars(oa_result))
    if cr_result:
        cache_set(f"cr:{doi}", "crossref", vars(cr_result))

    title = (cr_result.title if cr_result else None) or fallback_title or doi

    return ExternalPaperData(
        doi=doi,
        title=title,
        openalex=oa_result,
        crossref=cr_result,
        recent_citing=recent_citing
    )


def _serialize_external(ep: ExternalPaperData) -> dict:
    """Convert ExternalPaperData → JSON-serializable dict cho frontend."""
    result = {
        "doi": ep.doi,
        "title": ep.title,
        "openalex": None,
        "crossref": None,
        "recent_citing": ep.recent_citing
    }
    if ep.openalex:
        result["openalex"] = {
            "citation_count": ep.openalex.citation_count,
            "publication_year": ep.openalex.publication_year,
            "related_count": len(ep.openalex.related_work_ids),
            "openalex_id": ep.openalex.openalex_id
        }
    if ep.crossref:
        result["crossref"] = {
            "authors": ep.crossref.authors,
            "journal": ep.crossref.journal,
            "year": ep.crossref.year,
            "publisher": ep.crossref.publisher,
            "citation_count": ep.crossref.citation_count,
            "is_valid": ep.crossref.is_valid
        }
    return result


def _get_papers_metadata(paper_ids: list[str], session) -> list[dict]:
    """Lấy file_path, title, authors từ SQLite cho các paper đã chọn."""
    if not paper_ids:
        return []
    from ..db.models import Paper
    papers = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
    return [
        {
            "file_path": p.file_path,
            "title": p.title,
            "authors": p.authors.split(",") if p.authors else []
        }
        for p in papers
    ]
```

### 6.4 Patch `main.py` — include router mới

```python
# Thêm vào phần include_router trong main.py
from routers.verify import router as verify_router
from routers.academic import router as academic_router

app.include_router(verify_router)
app.include_router(academic_router)
```

### 6.5 `backend/routers/academic.py` — Utility endpoints

```python
"""
GET /api/academic/doi   → tra DOI nhanh qua Crossref
GET /api/academic/paper → tra paper nhanh qua OpenAlex
Dùng cho LibraryView: hiển thị citation count bên cạnh paper.
"""
from fastapi import APIRouter, Query
from ..academic.openalex import get_work_by_doi as oa_get
from ..academic.crossref import get_work_by_doi as cr_get
from ..academic.cache import cache_get, cache_set, TTL_OPENALEX, TTL_CROSSREF

router = APIRouter(prefix="/api/academic", tags=["academic"])


@router.get("/doi")
async def lookup_doi(doi: str = Query(..., description="DOI string, e.g. 10.1234/abcd")):
    cached = cache_get(f"cr:{doi}", TTL_CROSSREF)
    if cached:
        return {"source": "cache", "data": cached}
    result = await cr_get(doi)
    if result:
        cache_set(f"cr:{doi}", "crossref", vars(result))
        return {"source": "crossref", "data": vars(result)}
    return {"source": "not_found", "data": None}


@router.get("/paper")
async def lookup_paper(doi: str = Query(...)):
    cached = cache_get(f"oa:{doi}", TTL_OPENALEX)
    if cached:
        return {"source": "cache", "data": cached}
    result = await oa_get(doi)
    if result:
        cache_set(f"oa:{doi}", "openalex", vars(result))
        return {"source": "openalex", "data": vars(result)}
    return {"source": "not_found", "data": None}
```

---

## 7. Phase 4 — Verify Mode Frontend

### 7.1 Patch `api.ts` — thêm callVerify()

```typescript
// Cap nhat 19/06/2026:
// Code hien tai khong dung ham callVerify().
// API client dang expose api.verify(query, paperIds) va
// api.verifyStream(message, paperIds, sessionId). Snippet nay la mau thiet ke cu.

// Thêm vào lib/api.ts

export interface VerifyRequest {
  message: string;
  paper_ids: string[];
  session_id?: string;
}

export interface ExternalSource {
  doi: string;
  title: string;
  openalex: {
    citation_count: number;
    publication_year: number | null;
    related_count: number;
    openalex_id: string;
  } | null;
  crossref: {
    authors: string[];
    journal: string | null;
    year: number | null;
    publisher: string | null;
    citation_count: number;
    is_valid: boolean;
  } | null;
  recent_citing: Array<{
    title: string;
    publication_year: number;
    doi?: string;
  }>;
}

export interface VerifyResponse {
  answer: string;
  citations: Citation[];
  external_sources: ExternalSource[];
  model_used: string;
  verify_status: "full" | "partial" | "local_only";
}

export async function callVerify(
  req: VerifyRequest,
  signal?: AbortSignal
): Promise<VerifyResponse> {
  const resp = await fetch(`${API_BASE}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `Verify failed: ${resp.status}`);
  }
  return resp.json();
}
```

### 7.2 `VerifyPanel.tsx` — Component hiển thị external sources

```tsx
// frontend/components/chat/VerifyPanel.tsx
import { ExternalSource } from "../../lib/api";

interface VerifyPanelProps {
  sources: ExternalSource[];
  status: "full" | "partial" | "local_only";
}

export function VerifyPanel({ sources, status }: VerifyPanelProps) {
  if (status === "local_only" || sources.length === 0) {
    return (
      <div className="verify-panel verify-panel--local">
        <span className="verify-icon">📄</span>
        <span className="verify-label">Chỉ dựa trên tài liệu local — không tìm được DOI để verify ngoài</span>
      </div>
    );
  }

  return (
    <div className="verify-panel">
      <div className="verify-panel__header">
        <span className="verify-icon">{status === "full" ? "✅" : "⚠️"}</span>
        <span className="verify-title">
          {status === "full" ? "Đã verify qua OpenAlex + Crossref" : "Verify một phần"}
        </span>
      </div>

      {sources.map((src) => (
        <div key={src.doi} className="verify-source-card">
          <div className="verify-source-title">{src.title}</div>
          <div className="verify-source-doi">
            <a
              href={`https://doi.org/${src.doi}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              doi:{src.doi}
            </a>
          </div>

          <div className="verify-badges">
            {src.openalex && (
              <span className="badge badge--openalex">
                📊 {src.openalex.citation_count.toLocaleString()} citations
              </span>
            )}
            {src.crossref?.journal && (
              <span className="badge badge--crossref">
                📰 {src.crossref.journal}
              </span>
            )}
            {src.crossref?.year && (
              <span className="badge badge--year">
                🗓 {src.crossref.year}
              </span>
            )}
          </div>

          {src.recent_citing.length > 0 && (
            <div className="verify-recent">
              <div className="verify-recent__label">
                Nghiên cứu gần đây trích dẫn paper này:
              </div>
              {src.recent_citing.slice(0, 3).map((cite, i) => (
                <div key={i} className="verify-recent__item">
                  <span className="verify-recent__year">{cite.publication_year}</span>
                  <span className="verify-recent__title">{cite.title}</span>
                  {cite.doi && (
                    <a
                      href={`https://doi.org/${cite.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="verify-recent__link"
                    >
                      ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 7.3 Patch `ChatView.tsx` — thêm Verify tab

```tsx
// Trong ChatView.tsx, thêm vào mode selector
// Tìm phần modes: ['chat', 'review', 'critique', 'debate']
// Thêm 'verify' vào list

// State mới cần thêm
const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

// Handler mới
const handleVerify = async (message: string) => {
  const abortCtrl = new AbortController();
  setAbortController(abortCtrl);
  setIsLoading(true);
  setVerifyResult(null);

  try {
    const result = await callVerify(
      {
        message,
        paper_ids: selectedPaperIds,
        session_id: sessionId,
      },
      abortCtrl.signal
    );
    setVerifyResult(result);
    // Thêm vào messages như bình thường
    addMessage({ role: "assistant", content: result.answer, isVerify: true });
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      showToast("Verify thất bại — kiểm tra kết nối mạng", "error");
    }
  } finally {
    setIsLoading(false);
  }
};

// Trong JSX, render VerifyPanel dưới message khi mode === 'verify'
{mode === "verify" && verifyResult && (
  <VerifyPanel
    sources={verifyResult.external_sources}
    status={verifyResult.verify_status}
  />
)}
```

---

## 8. Phase 5 — Background Enrichment

Khi user import paper → chạy ngầm fetch metadata từ Crossref + citation count từ OpenAlex → lưu cache. Đến khi user dùng Verify Mode, data đã sẵn sàng → không có latency.

### Patch `routers/papers.py` — thêm background task

```python
# Trong endpoint POST /api/papers/import, sau khi import xong:
from fastapi import BackgroundTasks
from ..academic.doi_extractor import extract_doi_from_paper
from ..academic.openalex import get_work_by_doi as oa_get
from ..academic.crossref import get_work_by_doi as cr_get
from ..academic.cache import cache_set, TTL_OPENALEX, TTL_CROSSREF

async def _enrich_paper_background(paper_id: str, file_path: str, title: str, authors: list):
    """
    Chạy ngầm sau khi import — không block import pipeline.
    Lỗi ở đây không ảnh hưởng gì đến import.
    """
    try:
        doi = await extract_doi_from_paper(
            pdf_path=file_path,
            title=title,
            authors=authors
        )
        if not doi:
            return  # Paper không có DOI, bỏ qua

        # Parallel fetch
        oa, cr = await asyncio.gather(
            oa_get(doi),
            cr_get(doi),
            return_exceptions=True
        )

        if isinstance(oa, Exception):
            oa = None
        if isinstance(cr, Exception):
            cr = None

        if oa:
            cache_set(f"oa:{doi}", "openalex", vars(oa))
        if cr:
            cache_set(f"cr:{doi}", "crossref", vars(cr))

    except Exception:
        pass  # Background task — fail silently


# Trong import endpoint:
@router.post("/import")
async def import_paper(
    ...,
    background_tasks: BackgroundTasks
):
    # ... existing import logic ...
    paper = await do_import(...)

    # Thêm background enrichment
    background_tasks.add_task(
        _enrich_paper_background,
        paper_id=str(paper.id),
        file_path=paper.file_path,
        title=paper.title,
        authors=paper.authors.split(",") if paper.authors else []
    )

    return paper
```

---

## 9. Error Handling & Degraded Mode

### Nguyên tắc: không bao giờ để user thấy lỗi external API

| Tình huống | Hành vi |
|---|---|
| OpenAlex timeout | Tiếp tục với Crossref data nếu có, `verify_status = "partial"` |
| Crossref + OpenAlex đều fail | Trả lời từ local RAG, `verify_status = "local_only"` |
| DOI không tìm được | Bỏ qua external lookup, `verify_status = "local_only"` |
| OpenAlex rate limit (429) | Cache hit → trả cache cũ. Cache miss → `local_only` |
| Network offline | Catch exception → `local_only` gracefully |

```python
# Pattern xử lý trong _lookup_paper():
async def _safe_fetch(coro):
    """Wrapper: timeout 5s, bắt mọi exception, trả None nếu fail."""
    try:
        return await asyncio.wait_for(coro, timeout=5.0)
    except (asyncio.TimeoutError, Exception):
        return None

oa_result = await _safe_fetch(get_work_by_doi(doi))
cr_result = await _safe_fetch(crossref_get_work(doi))
```

### UI messaging

```tsx
// VerifyPanel.tsx — các trạng thái
const STATUS_MESSAGES = {
  full: "✅ Đã verify qua OpenAlex + Crossref",
  partial: "⚠️ Verify một phần — một số nguồn không phản hồi",
  local_only: "📄 Không tìm được dữ liệu external — chỉ dựa trên tài liệu local"
};
```

---

## 10. Caching Strategy

### Không dùng Redis — giữ local-first

| Layer | Storage | TTL | Key pattern |
|---|---|---|---|
| OpenAlex work data | SQLite (`academic_cache.db`) | 24h | `oa:{doi}` |
| Crossref metadata | SQLite | 7 ngày | `cr:{doi}` |
| Recent citing papers | SQLite | 12h | `oa_citing:{openalex_id}` |
| DOI extraction | In-memory dict (session) | — | `doi:{paper_id}` |

### Cache invalidation

```python
# User có thể force refresh từ UI (button trong VerifyPanel)
@router.delete("/api/academic/cache/{doi}")
async def invalidate_cache(doi: str):
    cache_invalidate_doi(doi)
    return {"status": "ok"}
```

---

## 11. Định nghĩa "v0.3 Done"

v0.3 hoàn thành khi tất cả các điều sau đều đúng:

```
✅/⏳ POST /api/verify đã có parallel fetch OpenAlex + Crossref + Semantic Scholar + LLM generate.
   Chưa có benchmark cố định để khẳng định luôn ≤ 8 giây trên máy/network thật.

✅ DOI extraction thành công trên ≥ 80% paper có DOI trong PDF metadata

✅ Khi OpenAlex/Crossref không trả lời → app không crash,
   trả về local_only gracefully

✅ VerifyPanel hiển thị citation count, recent citing papers, Semantic Scholar citations/recommendations
   cho ít nhất 1 paper khi verify

✅ Verify Mode hiển thị đúng verify_status:
   "full" / "partial" / "local_only"

✅ Background enrichment chạy sau import
   không làm chậm import pipeline

✅/⏳ Cache academic hoạt động qua SQLite file riêng. Chưa có benchmark tự động chứng minh request thứ 2 ≤ 0.1s.
```

### Không yêu cầu ở v0.3

- Streaming cho Verify Mode đã có trong code hiện tại
- Retraction Watch check (làm v0.4)
- Semantic Scholar đã có trong code hiện tại
- "Deep Research" mode (làm v0.4)

---

## 12. Thứ tự Implement

```
Ngày 1–2: Phase 1
  ├── Tạo backend/academic/__init__.py
  ├── Viết openalex.py + test thủ công với 2-3 DOI thật
  └── Viết crossref.py + test thủ công

Ngày 3: Phase 2
  ├── Viết doi_extractor.py
  └── Test extraction trên 5–10 paper thật trong library

Ngày 4: Phase 3 (Backend)
  ├── Viết academic/cache.py
  ├── Viết academic/context_builder.py
  ├── Viết routers/verify.py
  ├── Viết routers/academic.py
  └── Patch main.py include routers
      Test: curl POST /api/verify với paper có DOI

Ngày 5–6: Phase 4 (Frontend)
  ├── Patch api.ts thêm callVerify()
  ├── Tạo VerifyPanel.tsx
  └── Patch ChatView.tsx thêm verify mode
      Test: end-to-end với paper thật

Ngày 7: Phase 5 + Polish
  ├── Background enrichment trong papers router
  ├── Test degraded mode: tắt internet → verify vẫn trả local_only
  └── Đo latency: target ≤ 8s end-to-end

Ngày 8: Checklist v0.3 Done
  └── Chạy qua tất cả ✅ trong mục 11
```

### Dependencies cần install

```bash
# Thêm vào backend/requirements.txt
httpx>=0.27.0          # async HTTP client (thay requests)
# PyMuPDF đã có từ v0.1 → không cần thêm
# SQLite built-in → không cần thêm
```

---

*ResearchMind VN v0.3 Technical Spec — 18/06/2026*
*Dựa trên v0.1 (features) + v0.2 (performance) — bước tiếp theo: correctness*
