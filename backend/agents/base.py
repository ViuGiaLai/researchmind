"""Base agent infrastructure — role-driven, tool-constrained, governance-backed."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentContext:
    """Shared context passed through the pipeline."""

    query: str
    paper_ids: list[str] = field(default_factory=list)
    venue_id: str = "ieee_trans"
    workflow_step: str = ""
    available_artifacts: dict[str, Any] = field(default_factory=dict)  # step_id → result
    language: str = "en"

    def with_artifact(self, step_id: str, result: Any) -> AgentContext:
        """Return a new context with the step artifact added."""
        new_artifacts = dict(self.available_artifacts)
        new_artifacts[step_id] = result
        return AgentContext(
            query=self.query,
            paper_ids=self.paper_ids,
            venue_id=self.venue_id,
            workflow_step=step_id,
            available_artifacts=new_artifacts,
            language=self.language,
        )

    @property
    def produced(self) -> set[str]:
        """Set of artifact keys already produced."""
        return set(self.available_artifacts.keys())


@dataclass
class AgentResult:
    """Output from a single agent run."""

    agent: str
    step: str
    success: bool
    output: Any = None
    errors: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "step": self.step,
            "success": self.success,
            "output": self.output if isinstance(self.output, (str, dict, list, type(None))) else str(self.output),
            "errors": self.errors,
            "metadata": self.metadata,
        }


class BaseAgent(ABC):
    """Abstract agent — each agent has a fixed role, allowed tools, and governance contract."""

    name: str = "base"
    allowed_tools: tuple[str, ...] = ()

    @property
    def system_contract(self) -> str:
        """Role-only system prompt from governance task_contracts."""
        from academic.governance import get_academic_governance

        try:
            return get_academic_governance().task_contract(self.name)
        except KeyError:
            return f"You are the {self.name} agent. Complete your assigned task accurately."

    def get_tool(self, tool_name: str):
        from academic.tools import get_tool

        if tool_name not in self.allowed_tools:
            raise PermissionError(f"Agent '{self.name}' is not allowed to use tool '{tool_name}'")
        return get_tool(tool_name)

    @abstractmethod
    async def run(self, ctx: AgentContext) -> AgentResult: ...
