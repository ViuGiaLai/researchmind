"""Tests for title/author quality and Vietnamese OCR repair."""

from ingestion.metadata_quality import (
    clean_authors,
    display_title,
    humanize_filename,
    is_poor_author,
    is_poor_title,
    repair_vietnamese_ocr_text,
    resolve_paper_title,
    strip_uuid_prefix,
)


def test_strip_uuid_prefix_from_storage_name():
    raw = "bfd3b29a-1234-5678-9abc-dbbff62d9f47_Bai_bao_ABC.pdf"
    assert strip_uuid_prefix(raw).startswith("Bai_bao")
    assert "bfd3b29a" not in strip_uuid_prefix(raw)


def test_humanize_filename_drops_uuid_and_extension():
    name = "bfd3b29a-1234-5678-9abc-dbbff62d9f47_Nghien_cuu_AI.pdf"
    assert humanize_filename(name) == "Nghien cuu AI"


def test_uuid_and_logo_titles_are_poor():
    assert is_poor_title("bfd3b29a-1234-5678-9abc-dbbff62d9f47")
    assert is_poor_title("Logo chữ K Tối giản Hiện đại Vàng đen")
    assert not is_poor_title("Deep Learning for Document Understanding")


def test_resolve_prefers_metadata_over_logo_ocr():
    title = resolve_paper_title(
        metadata_title="A Survey of Graph Neural Networks",
        suggested_title="Logo chữ K Tối giản Hiện đại Vàng đen",
        filename="bfd3b29a-1234-5678-9abc-dbbff62d9f47_survey.pdf",
    )
    assert "Graph Neural" in title
    assert "Logo" not in title


def test_resolve_falls_back_to_filename_not_uuid():
    title = resolve_paper_title(
        metadata_title="",
        suggested_title="Logo watermark copyright",
        filename="bfd3b29a-1234-5678-9abc-dbbff62d9f47_Phan_tich_he_thong.pdf",
    )
    assert "Phan tich he thong" in title
    assert "bfd3b29a" not in title


def test_display_title_repairs_stored_uuid_titles():
    shown = display_title(
        "bfd3b29a-1234-5678-9abc-dbbff62d9f47_My Paper Title",
        "original_name.pdf",
    )
    assert "My Paper Title" in shown or "original" in shown.lower()
    assert not shown.startswith("bfd3b29a")


def test_device_authors_filtered():
    assert is_poor_author("Unknown: Acer")
    assert is_poor_author("Acer")
    assert is_poor_author("Unknown")
    assert clean_authors(["Unknown: Acer", "Nguyen Van A", "admin"]) == ["Nguyen Van A"]


def test_vietnamese_ocr_spacing_repair():
    raw = "Hệ thố ng thiế t bị trí ch xuấ t dấ u má t tậ p ngườ i"
    fixed = repair_vietnamese_ocr_text(raw)
    assert "thống" in fixed or "thố ng" not in fixed
    assert "thiết" in fixed or "thiế t" not in fixed
    assert "người" in fixed or "ngườ i" not in fixed
    # At least the most common splits should merge
    assert "ngườ i" not in fixed
    assert "thiế t" not in fixed
    assert "xuấ t" not in fixed
