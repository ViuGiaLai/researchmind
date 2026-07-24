"""Base classes for the academic tool layer."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolResult:
    """Standardized output from any academic tool."""

    tool: str  # tool name
    success: bool
    data: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    provenance: str = ""  # which rule/source triggered this
    governance_version: str = ""  # snapshot of governance version used

    def to_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "success": self.success,
            "data": self.data,
            "errors": self.errors,
            "warnings": self.warnings,
            "provenance": self.provenance,
            "governance_version": self.governance_version,
        }


class BaseTool(ABC):
    """Abstract base for all academic tools.

    Subclasses implement `_run` and declare their `name` class attribute.
    Governance version is automatically stamped on every result.
    """

    name: str = "base"

    def run(self, **kwargs: Any) -> ToolResult:
        from academic.governance import get_academic_governance

        gov = get_academic_governance()
        try:
            result = self._run(**kwargs)
            result.governance_version = gov.version
            return result
        except Exception as exc:
            return ToolResult(
                tool=self.name,
                success=False,
                errors=[str(exc)],
                governance_version=gov.version,
            )

    @abstractmethod
    def _run(self, **kwargs: Any) -> ToolResult: ...
