"""
ResearchMind VN — Enterprise Journal Rule Auditor (v5.0 Provenance & Versioning).

Audits manuscripts against venue-specific rule definitions with full provenance tracking:
- Provenance (Official Author Guide Citation)
- Version & Last Updated Timestamps
- Priority Levels (Required, Recommended, Optional)
"""

import re
from typing import Any

from publishing.templates import get_venue_template


class AuditReport:
    def __init__(self, template_id: str):
        self.template = get_venue_template(template_id)
        self.checks: list[dict[str, Any]] = []
        self.critical_count: int = 0
        self.warning_count: int = 0
        self.suggestion_count: int = 0
        self.pass_count: int = 0
        self.category_scores: dict[str, list[int]] = {
            "Structure": [],
            "References": [],
            "Formatting": [],
            "Compliance": [],
        }

    def add_check(
        self,
        name: str,
        category: str,
        severity: str,
        message: str,
        why: str = "",
        location: str = "",
        priority: str = "required",
        auto_fix: dict[str, Any] | None = None,
    ):
        if category == "Figures":
            category = "Formatting"

        score_val = 100 if severity == "pass" else (20 if severity == "critical" else (60 if severity == "warning" else 85))
        if category in self.category_scores:
            self.category_scores[category].append(score_val)
        else:
            self.category_scores[category] = [score_val]

        if severity == "pass":
            self.pass_count += 1
        elif severity == "critical":
            self.critical_count += 1
        elif severity == "warning":
            self.warning_count += 1
        else:
            self.suggestion_count += 1

        provenance = self.template.get("provenance", f"{self.template['name']} Guidelines")

        self.checks.append({
            "name": name,
            "category": category,
            "severity": severity,
            "priority": priority,  # required | recommended | optional
            "message": message,
            "why": why,
            "provenance": provenance,
            "location": location,
            "auto_fix": auto_fix,
        })

    def to_dict(self) -> dict[str, Any]:
        cat_averages = {}
        for cat, vals in self.category_scores.items():
            cat_averages[cat] = round(sum(vals) / len(vals)) if vals else 100

        overall_score = max(0, 100 - (self.critical_count * 25) - (self.warning_count * 10) - (self.suggestion_count * 3))

        return {
            "template": self.template,
            "venue_info": {
                "id": self.template.get("id"),
                "name": self.template.get("name"),
                "venue_code": self.template.get("venue_code"),
                "publisher": self.template.get("publisher"),
                "version": self.template.get("version"),
                "last_updated": self.template.get("last_updated"),
                "provenance": self.template.get("provenance"),
            },
            "overall_score": overall_score,
            "category_scores": cat_averages,
            "counts": {
                "pass": self.pass_count,
                "critical": self.critical_count,
                "warning": self.warning_count,
                "suggestion": self.suggestion_count,
            },
            "checks": self.checks,
        }


def audit_manuscript(title: str, text_content: str, template_id: str = "cvpr", author_name: str = "") -> dict[str, Any]:
    """Audit a manuscript against venue-specific rule definitions with full provenance."""
    report = AuditReport(template_id)
    tmpl = report.template

    lines = text_content.splitlines()
    total_lines = len(lines)
    words = re.findall(r"\b\w+\b", text_content)
    total_words = len(words)

    constraints = tmpl.get("constraints", {})
    sub_layout = tmpl.get("submission_layout", "Single-column")
    words_per_page = 500 if "single" in sub_layout.lower() else 800
    est_pages = max(1, round(total_words / words_per_page, 1))

    # ─── 1. FORMATTING: Flexible Word Count & Page Budget ──────────────────
    word_limit = constraints.get("word_limit")
    if isinstance(word_limit, int):
        if total_words <= word_limit:
            report.add_check(
                name="Total Word Count",
                category="Formatting",
                severity="pass",
                priority="required",
                message=f"Manuscript length ({total_words} words, ~{est_pages} pages) satisfies {tmpl['name']} limit ({word_limit} words).",
                why=f"Required by {tmpl['publisher']} page budget guidelines.",
                location=f"Document-wide ({total_lines} lines)",
            )
        else:
            over = total_words - word_limit
            report.add_check(
                name="Total Word Count",
                category="Formatting",
                severity="critical",
                priority="required",
                message=f"Manuscript length ({total_words} words) exceeds max limit of {word_limit} words for {tmpl['name']}.",
                why=f"Required by {tmpl['publisher']} Author Guidelines. Exceeding word limit causes desk rejection.",
                location=f"Document-wide ({total_lines} lines)",
                auto_fix={
                    "type": "trim_suggestion",
                    "label": f"Trim ~{over} words",
                    "text": f"Suggest shortening sections to reduce ~{over} words.",
                },
            )
    else:
        report.add_check(
            name="Total Word Count",
            category="Formatting",
            severity="pass",
            priority="recommended",
            message=f"Manuscript contains ~{total_words} words (~{est_pages} pages). Page budget is venue-defined.",
            why=f"Venue-defined page limit for {tmpl['name']}.",
            location=f"Document-wide ({total_lines} lines)",
        )

    # ─── 2. STRUCTURE: Abstract Check ──────────────────────────────────────
    abstract_line = None
    for idx, l in enumerate(lines, 1):
        if re.search(r"(?i)^\s*#*\s*(?:abstract|tóm tắt)", l):
            abstract_line = idx
            break

    max_abs = constraints.get("max_abstract_words", 250)
    if abstract_line:
        abstract_text = text_content[text_content.lower().find("abstract"):text_content.lower().find("introduction")] if "introduction" in text_content.lower() else text_content
        abstract_words = len(re.findall(r"\b\w+\b", abstract_text[:1000]))
        if abstract_words <= max_abs:
            report.add_check(
                name="Abstract Length",
                category="Structure",
                severity="pass",
                priority="required",
                message=f"Abstract contains ~{abstract_words} words (Limit: {max_abs} words).",
                why="Required for indexing in digital libraries.",
                location=f"Line {abstract_line}",
            )
        else:
            report.add_check(
                name="Abstract Length",
                category="Structure",
                severity="warning",
                priority="recommended",
                message=f"Abstract is too long (~{abstract_words} words > limit {max_abs}).",
                why=f"Recommended by {tmpl['publisher']} Author Guidelines.",
                location=f"Line {abstract_line}",
            )
    else:
        report.add_check(
            name="Abstract Section",
            category="Structure",
            severity="critical",
            priority="required",
            message="Missing required 'Abstract' section.",
            why="Required by the selected venue template.",
            location="Top of document",
            auto_fix={
                "type": "insert_snippet",
                "label": "Insert Abstract Section",
                "snippet": "## Abstract\nThis paper presents a novel framework for scientific document understanding...\n\n",
                "insert_at": "top",
            },
        )

    # ─── 3. STRUCTURE: Mandatory Sections & Flexible Mappings ──────────────
    struct_rules = tmpl.get("structure_rules", {})
    for req_item in struct_rules.get("required_sections", []):
        synonyms = [req_item] if isinstance(req_item, str) else req_item
        primary_name = synonyms[0]

        found_line = None
        matched_synonym = None
        for syn in synonyms:
            for idx, l in enumerate(lines, 1):
                if syn.lower() in l.lower():
                    found_line = idx
                    matched_synonym = syn
                    break
            if found_line:
                break

        if found_line:
            mapping_str = f" (Mapped to {primary_name})" if matched_synonym.lower() != primary_name.lower() else ""
            report.add_check(
                name=f"Section: {primary_name}",
                category="Structure",
                severity="pass",
                priority="required",
                message=f"Found section '{matched_synonym}'{mapping_str}.",
                why="Required by the selected venue template.",
                location=f"Line {found_line}",
            )
        else:
            report.add_check(
                name=f"Section: {primary_name}",
                category="Structure",
                severity="critical" if primary_name in ["Abstract", "Introduction", "References"] else "warning",
                priority="required",
                message=f"Missing section for '{primary_name}' (Accepted variations: {', '.join(synonyms)}).",
                why="Required by the selected venue template.",
                location="Body text",
                auto_fix={
                    "type": "insert_snippet",
                    "label": f"Insert {primary_name} Section",
                    "snippet": f"\n## {primary_name}\nDetails for {primary_name} go here...\n",
                    "insert_at": "bottom",
                },
            )

    # ─── 4. STRUCTURE: Optional Sections (e.g. Related Work) ───────────────
    for opt_sec in struct_rules.get("optional_sections", []):
        found = any(opt_sec.lower() in l.lower() for l in lines)
        if not found:
            report.add_check(
                name=f"Section: {opt_sec}",
                category="Structure",
                severity="suggestion",
                priority="optional",
                message=f"Consider adding a '{opt_sec}' section.",
                why="Recommended for contextualizing research within existing literature.",
                location="Body text",
                auto_fix={
                    "type": "insert_snippet",
                    "label": f"Insert {opt_sec} Section",
                    "snippet": f"\n## {opt_sec}\nPrevious literature and survey of related approaches...\n",
                    "insert_at": "bottom",
                },
            )

    # ─── 5. COMPLIANCE & METADATA RULES ────────────────────────────────────
    meta_rules = tmpl.get("metadata_rules", {})

    if meta_rules.get("requires_ccs"):
        found_ccs = any("ccs concept" in l.lower() or "ccs concept" in text_content.lower() for l in lines)
        if found_ccs:
            report.add_check(
                name="ACM CCS Concepts",
                category="Compliance",
                severity="pass",
                priority="required",
                message="CCS Concepts section detected.",
                why="Required by ACM Digital Library for taxonomy classification (when supported by the selected template).",
                location="Document top",
            )
        else:
            report.add_check(
                name="ACM CCS Concepts",
                category="Compliance",
                severity="warning",
                priority="required",
                message="Missing CCS Concepts classification metadata.",
                why="Required by ACM Digital Library for taxonomy classification (when supported by the selected template).",
                location="Below Abstract",
                auto_fix={
                    "type": "insert_snippet",
                    "label": "Insert ACM CCS Concepts",
                    "snippet": "\n## CCS Concepts\n- Security and privacy -> Software security; Computing methodologies -> Machine learning;\n",
                    "insert_at": "top",
                },
            )

    if meta_rules.get("requires_keywords"):
        found_kw = any("keyword" in l.lower() or "từ khóa" in l.lower() for l in lines)
        if found_kw:
            report.add_check(
                name="Keywords Section",
                category="Compliance",
                severity="pass",
                priority="required",
                message="Keywords section detected.",
                why="Required for indexing in digital libraries.",
                location="Document top",
            )
        else:
            report.add_check(
                name="Keywords Section",
                category="Compliance",
                severity="warning",
                priority="required",
                message="Missing Keywords section.",
                why="Required for indexing in digital libraries.",
                location="Below Abstract",
                auto_fix={
                    "type": "insert_snippet",
                    "label": "Insert Keywords Placeholder",
                    "snippet": "\n## Keywords\nArtificial Intelligence, Document Understanding, Machine Learning\n",
                    "insert_at": "top",
                },
            )

    if meta_rules.get("requires_data_availability"):
        found_da = any("data availability" in l.lower() or "availability of data" in l.lower() for l in lines)
        if found_da:
            report.add_check(
                name="Data Availability Statement",
                category="Compliance",
                severity="pass",
                priority="required",
                message="Data Availability Statement detected.",
                why=f"Required by {tmpl['publisher']} open science policies.",
                location="Document body",
            )
        else:
            report.add_check(
                name="Data Availability Statement",
                category="Compliance",
                severity="suggestion",
                priority="recommended",
                message="Missing Data Availability Statement.",
                why=f"Recommended by {tmpl['publisher']} open science guidelines.",
                location="Before References",
                auto_fix={
                    "type": "insert_snippet",
                    "label": "Insert Data Availability",
                    "snippet": "\n## Data Availability Statement\nThe datasets generated during this study are available in the public repository...\n",
                    "insert_at": "bottom",
                },
            )

    # ─── 6. COMPLIANCE: Review Policy (Single-Blind, Double-Blind) ───────────
    policy = tmpl.get("review_policy", "single_blind")
    if policy == "double_blind":
        leak_lines = []
        if author_name:
            for idx, l in enumerate(lines, 1):
                if author_name.lower() in l.lower():
                    leak_lines.append((idx, f"Author name '{author_name}'"))

        for idx, l in enumerate(lines, 1):
            email_match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", l)
            if email_match:
                leak_lines.append((idx, f"Email '{email_match.group(0)}'"))

        if not leak_lines:
            report.add_check(
                name="Double-Blind Anonymization",
                category="Compliance",
                severity="pass",
                priority="required",
                message="No author identity leaks or emails detected.",
                why=f"Required for double-blind peer review integrity in selected {tmpl['name']} track.",
                location="Document-wide",
            )
        else:
            loc_str = ", ".join(f"Line {line_num}" for line_num, _ in leak_lines[:3])
            reasons = "; ".join(desc for _, desc in leak_lines[:3])
            report.add_check(
                name="Double-Blind Anonymization",
                category="Compliance",
                severity="critical",
                priority="required",
                message=f"Potential identity leak detected: {reasons}.",
                why=f"Required by {tmpl['name']} Double-Blind Author Guidelines.",
                location=loc_str,
                auto_fix={
                    "type": "anonymize_text",
                    "label": "Mask Author Details",
                    "snippet": "[Anonymized for Double-Blind Review]",
                },
            )
    else:
        report.add_check(
            name="Author Affiliations & Identity",
            category="Compliance",
            severity="pass",
            priority="recommended",
            message=f"{tmpl['name']} uses Single-Blind / Standard Track. Author names & affiliations on title page are expected.",
            why="Standard single-blind journals print author identities on manuscript submission.",
            location="Title page",
        )

    # ─── 7. REFERENCES: Citations & Supported Styles ────────────────────────
    styles_str = ", ".join(tmpl.get("supported_citation_styles", ["Standard Citation Style"]))
    citation_lines = [idx for idx, l in enumerate(lines, 1) if re.search(r"\[\d+\]|\[[A-Za-z]+\s*et\s*al\.\,?\s*\d{4}\]", l)]

    if citation_lines:
        report.add_check(
            name="In-Text Citations",
            category="References",
            severity="pass",
            priority="required",
            message=f"Found in-text citations matching supported styles ({styles_str}).",
            why="Required for academic citation accuracy.",
            location=f"Line {citation_lines[0]}",
        )
    else:
        report.add_check(
            name="In-Text Citations",
            category="References",
            severity="warning",
            priority="required",
            message=f"No in-text citations matching supported styles ({styles_str}) detected.",
            why=f"Required by {tmpl['name']} Author Guidelines.",
            location="Body text",
            auto_fix={
                "type": "insert_snippet",
                "label": "Insert Citation Example",
                "snippet": " [1]",
                "insert_at": "cursor",
            },
        )

    # ─── 8. FORMATTING: Figures & Tables Captions ──────────────────────────
    fig_lines = [idx for idx, l in enumerate(lines, 1) if re.search(r"(?i)(?:fig\.|figure|hình)\s*\d+", l)]
    if fig_lines:
        report.add_check(
            name="Figures & Tables",
            category="Formatting",
            severity="pass",
            priority="recommended",
            message=f"Detected figure/table cross-references (Line {fig_lines[0]}).",
            why="Recommended for manuscript visual clarity.",
            location=f"Line {fig_lines[0]}",
        )
    else:
        report.add_check(
            name="Figures & Tables",
            category="Formatting",
            severity="suggestion",
            priority="optional",
            message="No explicit Figure or Table cross-references (e.g. 'Fig. 1') detected.",
            why="Recommended for improving paper readability.",
            location="Body text",
        )

    return report.to_dict()
