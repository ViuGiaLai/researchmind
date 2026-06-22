"""Jinja2 prompt template loading and rendering.

Adapted from open-notebook (MIT):
https://github.com/lfnovo/open-notebook/blob/main/open_notebook/graphs/ask.py

Prompts are stored as Jinja2 templates in backend/prompts/,
organized by workflow directory.
"""

import os
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from loguru import logger

_PROMPT_DIR = Path(__file__).parent.parent / "prompts"
_env: Environment | None = None


def _get_env() -> Environment:
    global _env
    if _env is None:
        _env = Environment(
            loader=FileSystemLoader(str(_PROMPT_DIR)),
            trim_blocks=True,
            lstrip_blocks=True,
            autoescape=False,
        )
    return _env


def render(template_path: str, **kwargs: Any) -> str:
    """
    Render a Jinja2 prompt template.

    Args:
        template_path: Relative path from backend/prompts/, e.g. "search/synthesis"
            (maps to backend/prompts/search/synthesis.jinja)
        **kwargs: Variables to inject into the template.

    Returns:
        Rendered prompt string.
    """
    # Normalize: add .jinja extension if not present
    if not template_path.endswith(".jinja"):
        template_path += ".jinja"

    # Normalize forward slashes
    template_path = template_path.replace("\\", "/")

    try:
        template = _get_env().get_template(template_path)
        return template.render(**kwargs)
    except TemplateNotFound:
        logger.warning(f"Template not found: {template_path}")
        return kwargs.get("default", "")
    except Exception as e:
        logger.error(f"Error rendering template {template_path}: {e}")
        return kwargs.get("default", "")


def exists(template_path: str) -> bool:
    """Check if a prompt template exists."""
    if not template_path.endswith(".jinja"):
        template_path += ".jinja"
    template_path = template_path.replace("\\", "/")
    try:
        _get_env().get_template(template_path)
        return True
    except TemplateNotFound:
        return False


def list_templates() -> list[str]:
    """List all available prompt templates."""
    templates = []
    for root, dirs, files in os.walk(str(_PROMPT_DIR)):
        for f in files:
            if f.endswith(".jinja"):
                rel = os.path.relpath(os.path.join(root, f), _PROMPT_DIR)
                templates.append(rel)
    return sorted(templates)
