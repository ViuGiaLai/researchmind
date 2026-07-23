"""Auto Fixer tool — applies mechanical, rule-safe fixes from an audit report."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .base import BaseTool, ToolResult


@dataclass
class FixEntry:
    rule: str
    location: str
    change: str
    original: str
    fixed: str


class AutoFixerTool(BaseTool):
    """Applies only mechanical, policy-safe auto-fixes from an AuditReport.

    Policy rules (from auto_fix_policy rule pack):
    - Never modify experimental results, claims, or conclusions.
    - Only insert missing section headers, reformat citation markers, trim whitespace.
    - Every fix is logged in the FixEntry diff log.
    - Stops and returns success=False when ambiguity is detected.
    """
    name = "auto_fixer"

    def _run(  # type: ignore[override]
        self,
        text: str,
        audit_data: dict[str, Any],
    ) -> ToolResult:
        from academic.governance import get_academic_governance
        gov = get_academic_governance()
        policy = gov.rules(("auto_fix_policy",))

        fixes: list[FixEntry] = []
        current_text = text
        ambiguous: list[str] = []

        for check in audit_data.get("checks", []):
            auto_fix = check.get("auto_fix")
            if not auto_fix:
                continue

            fix_type = auto_fix.get("type")
            rule = check.get("name", "unknown")

            if fix_type == "insert_snippet":
                snippet = auto_fix.get("snippet", "")
                if snippet and snippet.strip() not in current_text:
                    original = current_text[:50]
                    current_text = snippet + "\n\n" + current_text
                    fixes.append(FixEntry(
                        rule=rule,
                        location="top",
                        change="insert_snippet",
                        original=original,
                        fixed=snippet[:80],
                    ))
            elif fix_type == "trim_suggestion":
                # Trim suggestion is informational only; cannot auto-apply
                ambiguous.append(f"Trim required for '{rule}' — needs human review")
            elif fix_type == "replace":
                old = auto_fix.get("old", "")
                new = auto_fix.get("new", "")
                if old and new and old in current_text:
                    count = current_text.count(old)
                    if count > 1:
                        ambiguous.append(f"Ambiguous replace for '{rule}': {count} occurrences")
                    else:
                        original_snippet = current_text[current_text.index(old):current_text.index(old)+len(old)]
                        current_text = current_text.replace(old, new, 1)
                        fixes.append(FixEntry(
                            rule=rule,
                            location=check.get("location", "unknown"),
                            change="replace",
                            original=original_snippet[:80],
                            fixed=new[:80],
                        ))

        return ToolResult(
            tool=self.name,
            success=len(ambiguous) == 0,
            data={
                "fixed_text": current_text,
                "fixes_applied": [vars(f) for f in fixes],
                "fixes_count": len(fixes),
                "ambiguous": ambiguous,
                "policy_rules": list(policy),
            },
            warnings=ambiguous,
            provenance="auto_fix_policy rule pack (academic_governance.json)",
        )
