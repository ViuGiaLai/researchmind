"""Tests for PDF annotator — highlight text in PDFs."""

from pathlib import Path

import fitz
import pytest

from utils.pdf_annotator import (
    add_highlights_to_pdf,
    save_highlighted_pdf,
)


@pytest.fixture
def sample_pdf_path(tmp_path: Path) -> Path:
    """Create a minimal 2-page PDF with known text."""
    doc = fitz.open()
    page1 = doc.new_page()
    page1.insert_text((50, 100), "Introduction to Artificial Intelligence", fontsize=14)

    page2 = doc.new_page()
    page2.insert_text((50, 100), "Deep Learning and Neural Networks", fontsize=14)

    path = tmp_path / "sample.pdf"
    doc.save(str(path), garbage=4)
    doc.close()
    return path


class TestAddHighlightsToPdf:
    def test_highlights_exact_text(self, sample_pdf_path: Path):
        """Highlight text that matches exactly."""
        highlights = [
            {"page": 1, "text": "Introduction to Artificial Intelligence"},
        ]
        result = add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_highlights_multiple_pages(self, sample_pdf_path: Path):
        """Highlight text across multiple pages."""
        highlights = [
            {"page": 1, "text": "Introduction to"},
            {"page": 2, "text": "Deep Learning"},
        ]
        result = add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
        )
        assert isinstance(result, bytes)

    def test_highlight_skipped_if_text_not_found(self, sample_pdf_path: Path):
        """Skip highlight when text is not on the specified page."""
        highlights = [
            {"page": 1, "text": "NonExistent Text XYZ"},
        ]
        result = add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
        )
        assert isinstance(result, bytes)

    def test_highlight_page_out_of_range(self, sample_pdf_path: Path):
        """Skip highlight when page number is out of range."""
        highlights = [
            {"page": 99, "text": "Introduction"},
        ]
        result = add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
        )
        assert isinstance(result, bytes)

    def test_empty_highlights_list(self, sample_pdf_path: Path):
        """Handle empty highlights list gracefully."""
        result = add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=[],
        )
        assert isinstance(result, bytes)

    def test_highlight_with_empty_text(self, sample_pdf_path: Path):
        """Handle highlight entry with empty text."""
        highlights = [
            {"page": 1, "text": ""},
            {"page": 2, "text": "Deep Learning"},
        ]
        result = add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
        )
        assert isinstance(result, bytes)

    def test_save_to_output_path(self, sample_pdf_path: Path, tmp_path: Path):
        """Save highlighted PDF to a specified output path."""
        output_path = tmp_path / "output.pdf"

        highlights = [{"page": 1, "text": "Artificial Intelligence"}]
        add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
            output_path=output_path,
        )

        assert output_path.exists()
        assert output_path.stat().st_size > 0

    def test_save_highlighted_pdf_helper(self, sample_pdf_path: Path, tmp_path: Path):
        """Test the save_highlighted_pdf convenience wrapper."""
        output_path = tmp_path / "highlighted.pdf"
        highlights = [{"page": 1, "text": "Artificial Intelligence"}]

        result = save_highlighted_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
            output_path=output_path,
        )

        assert result == str(output_path)
        assert output_path.exists()

    def test_highlight_same_page_twice(self, sample_pdf_path: Path):
        """Add two highlights on the same page."""
        highlights = [
            {"page": 1, "text": "Introduction"},
            {"page": 1, "text": "Artificial Intelligence"},
        ]
        result = add_highlights_to_pdf(
            pdf_path=sample_pdf_path,
            highlights=highlights,
        )
        assert isinstance(result, bytes)
