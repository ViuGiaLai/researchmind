"""Shared types for LLM generation."""

from dataclasses import dataclass


@dataclass
class GenerationResult:
    """Result of LLM generation."""

    content: str
    citations: list[dict]
    model_used: str
    router_reason: str = ""
    router_token_count: int = 0
    finish_reason: str = "stop"
