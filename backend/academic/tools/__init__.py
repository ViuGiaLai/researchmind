"""Academic tool layer — standardized interfaces for all rule-based operations."""
from .base import ToolResult, BaseTool
from .registry import get_tool, TOOL_REGISTRY
from .citation_checker import CitationCheckerTool
from .doi_lookup import DOILookupTool
from .reference_validator import ReferenceValidatorTool
from .format_auditor import FormatAuditorTool
from .auto_fixer import AutoFixerTool
from .metadata_checker import MetadataCheckerTool
from .exporter import ExporterTool

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
