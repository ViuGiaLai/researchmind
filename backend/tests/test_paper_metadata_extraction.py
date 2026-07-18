from datetime import datetime

from ingestion.parser import _extract_metadata_year, _parse_pdf_authors


def test_pdf_date_format_extracts_full_year():
    assert _extract_metadata_year("D:20240115090000+07'00'") == 2024


def test_filename_year_extracts_full_year_not_prefix():
    assert _extract_metadata_year("", "research-paper-2021-final") == 2021


def test_invalid_or_future_year_is_ignored():
    assert _extract_metadata_year("D:18990101", f"paper-{datetime.now().year + 5}") is None


def test_pdf_authors_support_common_separators():
    assert _parse_pdf_authors("Alice Nguyen; Bob Tran") == ["Alice Nguyen", "Bob Tran"]
    assert _parse_pdf_authors("Alice Nguyen and Bob Tran") == ["Alice Nguyen", "Bob Tran"]
    assert _parse_pdf_authors("Alice Nguyen\nBob Tran") == ["Alice Nguyen", "Bob Tran"]
    assert _parse_pdf_authors("Alice Nguyen, Bob Tran") == ["Alice Nguyen", "Bob Tran"]


def test_pdf_authors_ignore_placeholder_and_email_values():
    assert _parse_pdf_authors("Unknown; contact@example.org; Alice Nguyen") == ["Alice Nguyen"]
