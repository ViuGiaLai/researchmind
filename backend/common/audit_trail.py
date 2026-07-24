"""Observability & Audit Trail — records complete lineage of AI execution."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from loguru import logger

_AUDIT_LOG_FILE = Path(__file__).parent.parent / "logs" / "audit_trail.jsonl"


@dataclass
class AuditTrailRecord:
    trace_id: str
    step_id: str
    agent_name: str
    rules_applied: list[str]
    tools_called: list[str]
    docs_retrieved: list[str]
    status: str
    duration_ms: float
    timestamp: str = field(default_factory=lambda: time.strftime("%Y-%m-%d %H:%M:%S"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "step_id": self.step_id,
            "agent_name": self.agent_name,
            "rules_applied": self.rules_applied,
            "tools_called": self.tools_called,
            "docs_retrieved": self.docs_retrieved,
            "status": self.status,
            "duration_ms": round(self.duration_ms, 2),
            "timestamp": self.timestamp,
        }


class AuditTrailLogger:
    """Logs full audit trails for AI platform compliance."""

    def __init__(self, log_path: Path = _AUDIT_LOG_FILE):
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def log(self, record: AuditTrailRecord):
        """Append an audit trail record as a JSON-Lines entry."""
        try:
            line = json.dumps(record.to_dict(), ensure_ascii=False)
            with self.log_path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception as exc:
            logger.error(f"AuditTrailLogger write error: {exc}")


audit_trail_logger = AuditTrailLogger()
