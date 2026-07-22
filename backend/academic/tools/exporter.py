"""Exporter tool — formats and exports manuscripts to PDF or LaTeX formats."""
from __future__ import annotations
from typing import Any
from .base import BaseTool, ToolResult


class ExporterTool(BaseTool):
    """Formats and exports manuscript drafts into PDF or LaTeX templates.
    Wraps existing export engines with a standardized ToolResult interface.
    """
    name = "exporter"

    def _run(  # type: ignore[override]
        self,
        content: str,
        export_format: str = "latex",
        venue_id: str = "ieee_trans",
        title: str = "Untitled Manuscript",
        author_name: str = "Anonymous",
    ) -> ToolResult:
        from publishing.templates import get_venue_template
        from academic.governance import get_academic_governance
        from publishing.latex_exporter import export_paper_to_latex_zip

        gov = get_academic_governance()
        template = get_venue_template(venue_id)
        export_rules = template.get("export_rules", {})
        latex_class = template.get("latex_class", "article")

        export_format = export_format.lower()
        if export_format in ("latex", "tex") and not export_rules.get("supports_latex", True):
            return ToolResult(
                tool=self.name,
                success=False,
                errors=[f"Venue '{venue_id}' does not support LaTeX export."],
                governance_version=gov.version,
            )

        try:
            if export_format in ("latex", "tex", "zip"):
                paper_data = {
                    "title": title,
                    "authors": [author_name] if author_name else [],
                    "content": content,
                }
                zip_bytes = export_paper_to_latex_zip(paper_data, template_id=venue_id)
                return ToolResult(
                    tool=self.name,
                    success=True,
                    data={
                        "format": export_format,
                        "zip_bytes_len": len(zip_bytes),
                        "latex_class": latex_class,
                        "venue_id": venue_id,
                    },
                    provenance=template.get("provenance", venue_id),
                    governance_version=gov.version,
                )
            else:
                # Text/Markdown fallback export
                return ToolResult(
                    tool=self.name,
                    success=True,
                    data={
                        "format": export_format,
                        "content": content,
                        "venue_id": venue_id,
                    },
                    provenance=template.get("provenance", venue_id),
                    governance_version=gov.version,
                )
        except Exception as exc:
            return ToolResult(
                tool=self.name,
                success=False,
                errors=[f"Export failed: {exc}"],
                governance_version=gov.version,
            )
