"""Versioned prompt registry with optional output-schema metadata."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PromptSpec:
    name: str
    version: str
    template: str
    output_schema: dict | None = None
    def render(self, **values: str) -> str:
        return self.template.format(**values)
_REGISTRY: dict[str, PromptSpec] = {}
def register(spec: PromptSpec) -> None:
    if spec.name in _REGISTRY:
        raise ValueError(f"Prompt already registered: {spec.name}")
    _REGISTRY[spec.name] = spec
def get(name: str) -> PromptSpec:
    return _REGISTRY[name]
register(PromptSpec(
    "rag.answer",
    "2.0.0",
    "## Document context:\n{context}\n\n## Question:\n{query}\n\nAnswer with supported information. Cite [Paper title, page X] when supplied, otherwise [Paper title]. State evidence gaps and conflicts explicitly.",
))
