"""Text chunking for RAG pipeline — SentenceSplitter (llama_index-inspired).

Splits documents into chunks at sentence/paragraph boundaries with
configurable overlap, preferring cleaner break points than naive
character-level splitting.

MIT License — adapted from llama_index:
https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/node_parser/text/sentence.py
"""

import re
from dataclasses import dataclass


@dataclass
class Chunk:
    index: int
    text: str
    page_number: int | None
    section_header: str
    token_count: int
    paper_id: str = ""


DEFAULT_CHUNK_SIZE = 512
DEFAULT_CHUNK_OVERLAP = 50
PARAGRAPH_SEP = r"\n\s*\n"
SENTENCE_PATTERN = r"(?<=[.?!])\s+(?=[A-ZÀ-Ỹ\(\"])"

# Vietnamese-aware sentence-ending characters
SENTENCE_END = re.compile(r"[.?!…](\s|$)")


def count_tokens(text: str) -> int:
    return len(text) // 4


# Image OCR blocks — kept as dedicated RAG chunks (not merged into long text chunks)
IMAGE_BLOCK_PREFIXES = ("[Image content", "[Image:")


def _is_image_block(paragraph: str) -> bool:
    stripped = paragraph.strip()
    return stripped.startswith(IMAGE_BLOCK_PREFIXES)


class SentenceSplitter:
    """Split text into chunks at sentence/paragraph boundaries.

    Splitting priority:
    1. Paragraph boundaries (\n\n)
    2. Sentence boundaries (. ! ? followed by capital letter)
    3. Fallback: character-level split at chunk_size

    Args:
        chunk_size: Target tokens per chunk.
        chunk_overlap: Token overlap between consecutive chunks.
    """

    def __init__(
        self,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def __call__(self, text_by_page: dict[int, str]) -> list[Chunk]:
        return self.chunk_text(text_by_page)

    def chunk_text(self, text_by_page: dict[int, str]) -> list[Chunk]:
        chunks: list[Chunk] = []
        overlap_chars = self.chunk_overlap * 4
        self.chunk_size * 4

        buffer = ""
        current_page = 1

        for page_num in sorted(text_by_page.keys()):
            page_text = text_by_page[page_num] or ""
            try:
                from ingestion.metadata_quality import normalize_ocr_page_text

                page_text = normalize_ocr_page_text(page_text)
            except Exception:
                pass
            paragraphs = self._split_paragraphs(page_text)

            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue

                if _is_image_block(para):
                    fig_header = para.split("\n", 1)[0][:120]
                    chunks.append(
                        Chunk(
                            index=len(chunks),
                            text=para,
                            page_number=page_num,
                            section_header=fig_header or "Figure/Diagram",
                            token_count=count_tokens(para),
                        )
                    )
                    continue

                section = _detect_section_header(para)

                if not buffer:
                    buffer = para
                    current_page = page_num
                else:
                    combined = buffer + "\n\n" + para
                    if count_tokens(combined) > self.chunk_size and count_tokens(buffer) > self.chunk_size // 2:
                        chunks.append(
                            Chunk(
                                index=len(chunks),
                                text=buffer.strip(),
                                page_number=current_page,
                                section_header=section or "",
                                token_count=count_tokens(buffer),
                            )
                        )
                        buffer = (
                            self._take_overlap(buffer, overlap_chars) + "\n\n" + para
                            if self.chunk_overlap > 0 and len(buffer) > overlap_chars
                            else para
                        )
                        if not section:
                            section = ""
                        current_page = page_num
                    else:
                        buffer = combined

            if count_tokens(buffer) >= self.chunk_size:
                chunks.append(
                    Chunk(
                        index=len(chunks),
                        text=buffer.strip(),
                        page_number=current_page,
                        section_header="",
                        token_count=count_tokens(buffer),
                    )
                )
                buffer = self._take_overlap(buffer, overlap_chars) if self.chunk_overlap > 0 else ""
                current_page = page_num

        if buffer.strip() and count_tokens(buffer) > self.chunk_size // 4:
            chunks.append(
                Chunk(
                    index=len(chunks),
                    text=buffer.strip(),
                    page_number=current_page,
                    section_header="",
                    token_count=count_tokens(buffer),
                )
            )

        return chunks

    def _split_paragraphs(self, text: str) -> list[str]:
        return re.split(PARAGRAPH_SEP, text)

    def _split_sentences(self, text: str) -> list[str]:
        sentences = re.split(SENTENCE_PATTERN, text)
        return [s.strip() for s in sentences if s.strip()]

    def _take_overlap(self, text: str, n_chars: int) -> str:
        if len(text) <= n_chars:
            return text
        tail = text[-n_chars:]
        sentences = self._split_sentences(tail)
        if len(sentences) >= 2:
            return " ".join(sentences[1:]).strip()
        for sep in ["\n\n", ". ", ".\n", "! ", "? "]:
            idx = tail.find(sep)
            if idx != -1:
                return tail[idx + len(sep) :].strip()
        return tail.strip()


def _detect_section_header(paragraph: str) -> str:
    cleaned = paragraph.strip()
    if not cleaned:
        return ""
    if len(cleaned) < 100 and (cleaned.startswith("#") or cleaned.isupper() or re.match(r"^\d+(\.\d+)*\s", cleaned)):
        return cleaned[:100]
    return ""


chunk_text = SentenceSplitter().chunk_text
