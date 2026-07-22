"""Memory & Learning module — logs user feedback and correction patterns for review loops."""
from __future__ import annotations
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from loguru import logger

_MEMORY_FILE = Path(__file__).parent / "resources" / "user_memory.json"


@dataclass
class FeedbackEntry:
    user_id: str
    paper_id: str
    venue_id: str
    step_id: str
    issue_type: str
    user_correction: str
    agent_output: str
    timestamp: str = field(default_factory=lambda: time.strftime("%Y-%m-%d %H:%M:%S"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "paper_id": self.paper_id,
            "venue_id": self.venue_id,
            "step_id": self.step_id,
            "issue_type": self.issue_type,
            "user_correction": self.user_correction,
            "agent_output": self.agent_output[:200],
            "timestamp": self.timestamp,
        }


class MemoryStore:
    """Persistent storage for user feedback and correction loops."""

    def __init__(self, storage_path: Path = _MEMORY_FILE):
        self.storage_path = storage_path
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._entries: list[dict[str, Any]] = self._load()

    def _load(self) -> list[dict[str, Any]]:
        if not self.storage_path.exists():
            return []
        try:
            with self.storage_path.open(encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.warning(f"Failed to load memory store: {exc}")
            return []

    def save(self):
        try:
            with self.storage_path.open("w", encoding="utf-8") as f:
                json.dump(self._entries, f, indent=2, ensure_ascii=False)
        except Exception as exc:
            logger.error(f"Failed to save memory store: {exc}")

    def record_feedback(self, entry: FeedbackEntry):
        """Record user feedback into the memory log.

        Feedback is audited and stored without modifying static rules automatically.
        """
        self._entries.append(entry.to_dict())
        self.save()
        logger.info(f"Recorded memory feedback from user '{entry.user_id}' for step '{entry.step_id}'")

    def get_feedback_for_venue(self, venue_id: str) -> list[dict[str, Any]]:
        return [e for e in self._entries if e.get("venue_id") == venue_id]

    def summarize_learning_insights(self) -> dict[str, Any]:
        return {}


global_memory_store = MemoryStore()
