"""Deterministic workflow manifests for research operations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from academic.governance import get_academic_governance


@dataclass(frozen=True)
class WorkflowStep:
    id: str
    kind: str
    tool: str                          # tool name from academic_governance.json
    requires: tuple[str, ...]
    produces: tuple[str, ...]


@dataclass(frozen=True)
class WorkflowPlan:
    name: str
    governance_version: str
    steps: tuple[WorkflowStep, ...]

    def next_step(self, available: Iterable[str]) -> WorkflowStep | None:
        available_set = set(available)
        return next(
            (
                step for step in self.steps
                if set(step.requires).issubset(available_set)
                and not set(step.produces).issubset(available_set)
            ),
            None,
        )

    def get_step_tool(self, step_id: str) -> str | None:
        """Return the tool name for a given step id, or None if step not found."""
        for step in self.steps:
            if step.id == step_id:
                return step.tool or None
        return None


def build_workflow(name: str = "research_analysis") -> WorkflowPlan:
    governance = get_academic_governance()
    steps = tuple(
        WorkflowStep(
            id=str(item["id"]),
            kind=str(item["kind"]),
            tool=str(item.get("tool", "")),
            requires=tuple(item.get("requires", [])),
            produces=tuple(item.get("produces", [])),
        )
        for item in governance.workflow(name)
    )
    return WorkflowPlan(name=name, governance_version=governance.version, steps=steps)