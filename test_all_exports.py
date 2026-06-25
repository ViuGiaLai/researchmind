"""
Test all export formats (PDF, HTML, DOCX) using the same logic
as the synthesis export endpoint.
"""

import os
import sys
import tempfile


def test_pdf_export():
    from test_pdf_export import generate_pdf

    markdown = """# Test Report

## Section 1
This is a **test** paragraph with *italic* and `code`.

- Item 1
- Item 2

| A | B |
|---|---|
| 1 | 2 |
"""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        path = f.name
    try:
        generate_pdf("Test_Report", markdown, path)
        size = os.path.getsize(path)
        assert size > 0, f"PDF generated but file is empty ({size} bytes)"
        print(f"✅ PDF export OK: {size} bytes")
    finally:
        os.unlink(path)


def test_html_export():
    from test_html_export import generate_html

    markdown = """# Test Report

## Section 1
This is a **test** paragraph with *italic* and `code`.
"""
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as f:
        path = f.name
    try:
        generate_html("Test_Report", markdown, path)
        size = os.path.getsize(path)
        assert size > 0, f"HTML generated but file is empty ({size} bytes)"
        print(f"✅ HTML export OK: {size} bytes")
    finally:
        os.unlink(path)


def test_docx_export():
    from test_docx_export import generate_docx

    markdown = """# Test Report

## Section 1
This is a **test** paragraph with *italic* support.
"""
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
        path = f.name
    try:
        generate_docx("Test_Report", markdown, path)
        size = os.path.getsize(path)
        assert size > 0, f"DOCX generated but file is empty ({size} bytes)"
        print(f"✅ DOCX export OK: {size} bytes")
    finally:
        os.unlink(path)
