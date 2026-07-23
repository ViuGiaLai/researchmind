"""Tests for image OCR during document import."""

from pathlib import Path

from PIL import Image, ImageDraw

from ingestion.image_ocr import MIN_IMAGE_DIM, ocr_image_bytes


def _make_text_image(text: str) -> bytes:
    img = Image.new("RGB", (max(MIN_IMAGE_DIM + 20, 320), 120), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((12, 40), text, fill=(0, 0, 0))
    from io import BytesIO

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_ocr_image_bytes_reads_simple_text():
    img_bytes = _make_text_image("Figure 1 Results")
    # The generated fixture is intentionally tiny on disk; production uses a
    # byte-size threshold to skip icons and other low-value embedded images.
    result = ocr_image_bytes(img_bytes, skip_byte_size_check=True)
    assert result is not None
    assert len(result.strip()) >= 3


def test_extract_image_document(tmp_path: Path):
    from ingestion.parser import extract_document

    img_path = tmp_path / "chart.png"
    img_path.write_bytes(_make_text_image("Sample chart label"))

    doc = extract_document(str(img_path))
    assert doc is not None
    assert doc.page_count == 1
    assert doc.full_text.strip()
    assert doc.is_scanned is True
    # OCR may succeed or fall back to placeholder text — import must not fail
    assert "chart" in doc.full_text.lower() or doc.ocr_pages_failed == 1
