"""Plugin & Extension System — allows adding new venues, tools, and workflows dynamically."""
from __future__ import annotations
from typing import Any, Type
from loguru import logger
from academic.tools.base import BaseTool
from academic.tools.registry import TOOL_REGISTRY


class PluginManager:
    """Manager for registering custom venues, tools, and workflows at runtime."""

    def __init__(self):
        self._custom_venues: dict[str, dict[str, Any]] = {}
        self._custom_workflows: dict[str, dict[str, Any]] = {}

    def register_venue(self, venue_dict: dict[str, Any]) -> str:
        """Register a new venue template dynamically."""
        venue_id = venue_dict.get("id")
        if not venue_id:
            raise ValueError("Venue dict must contain an 'id' field")
        self._custom_venues[venue_id] = venue_dict
        logger.info(f"Registered custom venue plugin: '{venue_id}'")
        return venue_id

    def register_tool(self, name: str, tool_class: Type[BaseTool]):
        """Register a new tool class dynamically."""
        TOOL_REGISTRY[name] = tool_class
        logger.info(f"Registered custom tool plugin: '{name}'")

    def register_workflow(self, name: str, steps: list[dict[str, Any]]):
        """Register a custom workflow manifest dynamically."""
        self._custom_workflows[name] = {"steps": steps}
        logger.info(f"Registered custom workflow plugin: '{name}'")

    def get_custom_venue(self, venue_id: str) -> dict[str, Any] | None:
        return self._custom_venues.get(venue_id)

    def list_custom_venues(self) -> list[str]:
        return list(self._custom_venues.keys())


plugin_manager = PluginManager()
