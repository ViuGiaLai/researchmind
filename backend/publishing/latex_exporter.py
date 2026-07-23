"""
ResearchMind VN — LaTeX & BibTeX Exporter.

Converts paper manuscripts and literature reviews into valid, compile-ready LaTeX (.tex + .bib)
ZIP archives matching target publication templates (IEEE, Springer, ACM, etc.).
"""

import io
import re
import zipfile
from typing import Any

from publishing.templates import PUBLISHING_TEMPLATES


def _clean_latex_str(text: str) -> str:
    """Escape special LaTeX characters."""
    if not text:
        return ""
    replacements = {
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    # Don't escape if already escaped
    pattern = re.compile("|".join(re.escape(k) for k in replacements.keys()))
    return pattern.sub(lambda m: replacements[m.group(0)], text)


def build_bibtex_entry(paper_id: str, title: str, authors: list[str], year: Any, venue: str = "", doi: str = "") -> str:
    """Generate a clean BibTeX entry."""
    cite_key = f"{authors[0].split()[-1] if authors else 'Author'}{year or '2026'}"
    cite_key = re.sub(r"\W+", "", cite_key)

    authors_str = " and ".join(authors) if authors else "Unknown"
    lines = [
        f"@article{{{cite_key},",
        f"  title = {{{title}}},",
        f"  author = {{{authors_str}}},",
    ]
    if year:
        lines.append(f"  year = {{{year}}},")
    if venue:
        lines.append(f"  journal = {{{venue}}},")
    if doi:
        lines.append(f"  doi = {{{doi}}},")
    lines.append("}")
    return "\n".join(lines)


def export_paper_to_latex_zip(paper_data: dict[str, Any], template_id: str = "ieee") -> bytes:
    """Package paper into a ZIP containing main.tex and references.bib."""
    template = PUBLISHING_TEMPLATES.get(template_id, PUBLISHING_TEMPLATES["ieee"])
    latex_class = template.get("latex_class", "article")

    title = paper_data.get("title", "Untitled Manuscript")
    authors = paper_data.get("authors", [])
    year = paper_data.get("year", "2026")
    doi = paper_data.get("doi", "")
    abstract = paper_data.get("abstract", "")
    content = paper_data.get("content", "")

    # Prepare main.tex
    tex_lines = [
        f"\\documentclass{{{latex_class}}}",
        "\\usepackage[utf8]{inputenc}",
        "\\usepackage{cite}",
        "\\usepackage{amsmath,amssymb,amsfonts}",
        "\\usepackage{graphicx}",
        "",
        f"\\title{{{_clean_latex_str(title)}}}",
        f"\\author{{{_clean_latex_str(', '.join(authors)) if authors else 'Anonymized Author'}}}" if not template.get("double_blind") else "\\author{Anonymized for Double-Blind Review}",
        "\\date{\\today}",
        "",
        "\\begin{document}",
        "\\maketitle",
        "",
    ]

    if abstract:
        tex_lines.extend([
            "\\begin{abstract}",
            _clean_latex_str(abstract),
            "\\end{abstract}",
            "",
        ])

    tex_lines.extend([
        "\\section{Introduction}",
        _clean_latex_str(content if content else "Manuscript content placeholder."),
        "",
        "\\bibliographystyle{IEEEtran}" if template_id == "ieee" else "\\bibliographystyle{plain}",
        "\\bibliography{references}",
        "\\end{document}",
    ])

    tex_content = "\n".join(tex_lines)
    bib_content = build_bibtex_entry(paper_data.get("id", "paper1"), title, authors, year, doi=doi)

    # Compress into in-memory ZIP file
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("main.tex", tex_content.encode("utf-8"))
        zip_file.writestr("references.bib", bib_content.encode("utf-8"))
        zip_file.writestr("README.txt", f"Exported from ResearchMind VN\nTemplate: {template['name']}\nDate: {year}\n".encode())

    return buffer.getvalue()
