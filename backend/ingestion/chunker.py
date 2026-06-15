"""Text chunking for RAG pipeline.

Splits extracted PDF text into chunks of approximately `chunk_size` tokens
with `chunk_overlap` tokens of overlap between consecutive chunks.

Chunking is sentence-aware: prefers to split at paragraph breaks and
sentence boundaries to avoid cutting ideas mid-sentence.
"""

import re
from typing import Optional
from dataclasses import dataclass


@dataclass
class Chunk:
    index: int
    text: str
    page_number: Optional[int]
    section_header: str
    token_count: int
    paper_id: str = ""


def count_tokens(text: str) -> int:
    """Approximate token count (1 token ≈ 4 characters for English/Vietnamese)."""
    return len(text) // 4


def chunk_text(
    text_by_page: dict[int, str],
    chunk_size: int = 512,
    chunk_overlap: int = 50,
) -> list[Chunk]:
    """
    Split text (organized by page) into chunks.

    Args:
        text_by_page: Mapping of page_number -> page_text.
        chunk_size: Target tokens per chunk.
        chunk_overlap: Token overlap between consecutive chunks.

    Returns:
        List of Chunk objects with page tracking.
    """
    chunks: list[Chunk] = []
    current_text = ""
    current_page = 1
    overlap_size_chars = chunk_overlap * 4
    chunk_size_chars = chunk_size * 4

    for page_num in sorted(text_by_page.keys()):
        page_text = text_by_page[page_num]
        paragraphs = re.split(r"\n\s*\n", page_text)

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            # Detect section header (short, all caps or starts with #)
            section_header = _detect_section_header(para)

            if not current_text:
                current_text = para
                current_page = page_num
            else:
                # Check if adding this paragraph exceeds chunk_size
                combined = current_text + "\n\n" + para
                if count_tokens(combined) > chunk_size and count_tokens(current_text) > chunk_size // 2:
                    # Save current chunk
                    chunks.append(Chunk(
                        index=len(chunks),
                        text=current_text.strip(),
                        page_number=current_page,
                        section_header=section_header or "",
                        token_count=count_tokens(current_text),
                    ))
                    # Start new chunk with overlap
                    if chunk_overlap > 0 and len(current_text) > overlap_size_chars:
                        current_text = _take_last_n_chars(current_text, overlap_size_chars) + "\n\n" + para
                    else:
                        current_text = para
                    current_page = page_num
                else:
                    current_text = combined

        # Handle page boundary: if current chunk is large enough, save it
        if count_tokens(current_text) >= chunk_size:
            # Save current chunk
            chunks.append(Chunk(
                index=len(chunks),
                text=current_text.strip(),
                page_number=current_page,
                section_header="",
                token_count=count_tokens(current_text),
            ))
            if chunk_overlap > 0:
                current_text = _take_last_n_chars(current_text, overlap_size_chars)
            else:
                current_text = ""

    # Save the last chunk if there's remaining text
    if current_text.strip() and count_tokens(current_text) > chunk_size // 4:
        chunks.append(Chunk(
            index=len(chunks),
            text=current_text.strip(),
            page_number=current_page,
            section_header="",
            token_count=count_tokens(current_text),
        ))

    return chunks


def _detect_section_header(paragraph: str) -> str:
    """Detect if a paragraph looks like a section header."""
    cleaned = paragraph.strip()
    if not cleaned:
        return ""

    # Headers often: short, uppercase, start with # or numbers like 1.1
    if len(cleaned) < 100 and (
        cleaned.startswith("#")
        or cleaned.isupper()
        or re.match(r"^\d+(\.\d+)*\s", cleaned)
    ):
        return cleaned[:100]
    return ""


def _take_last_n_chars(text: str, n: int) -> str:
    """Take the last n characters, preferring sentence boundaries."""
    if len(text) <= n:
        return text

    tail = text[-n:]
    # Try to find a sentence boundary
    for sep in ["\n\n", ". ", ".\n", "! ", "? "]:
        idx = tail.find(sep)
        if idx != -1:
            return tail[idx + len(sep):]
    return tail
