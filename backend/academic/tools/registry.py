"""Tool registry — single lookup point for all academic tools."""

from __future__ import annotations

from .auto_fixer import AutoFixerTool
from .base import BaseTool
from .citation_checker import CitationCheckerTool
from .doi_lookup import DOILookupTool
from .exporter import ExporterTool
from .format_auditor import FormatAuditorTool
from .metadata_checker import MetadataCheckerTool
from .reference_validator import ReferenceValidatorTool

TOOL_REGISTRY: dict[str, type[BaseTool]] = {
    "citation_checker": CitationCheckerTool,
    "doi_lookup": DOILookupTool,
    "reference_validator": ReferenceValidatorTool,
    "format_auditor": FormatAuditorTool,
    "auto_fixer": AutoFixerTool,
    "metadata_checker": MetadataCheckerTool,
    "exporter": ExporterTool,
}


def get_tool(name: str) -> BaseTool:
    """Return an instantiated tool by name."""
    cls = TOOL_REGISTRY.get(name)
    if cls is None:
        raise KeyError(f"Unknown tool: {name!r}. Available: {list(TOOL_REGISTRY)!r}")
    return cls()
