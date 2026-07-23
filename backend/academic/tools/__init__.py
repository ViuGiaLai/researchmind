"""Academic tool layer — standardized interfaces for all rule-based operations."""
from .auto_fixer import AutoFixerTool
from .base import BaseTool, ToolResult
from .citation_checker import CitationCheckerTool
from .doi_lookup import DOILookupTool
from .exporter import ExporterTool
from .format_auditor import FormatAuditorTool
from .metadata_checker import MetadataCheckerTool
from .reference_validator import ReferenceValidatorTool
from .registry import TOOL_REGISTRY, get_tool

__all__ = [
    "ToolResult",
    "BaseTool",
    "get_tool",
    "TOOL_REGISTRY",
    "CitationCheckerTool",
    "DOILookupTool",
    "ReferenceValidatorTool",
    "FormatAuditorTool",
    "AutoFixerTool",
    "MetadataCheckerTool",
    "ExporterTool",
]
