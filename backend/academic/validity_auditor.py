"""Threats to Validity Auditor — audits internal, external, construct, and statistical validity.

Categories:
1. Internal Validity (Causal confounding, missing control variables)
2. External Validity (Generalizability across datasets/domains)
3. Construct Validity (Accuracy of measurement instruments)
4. Statistical Conclusion Validity (Sample size, statistical power)
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ValidityThreat:
    threat_category: str  # 'internal' | 'external' | 'construct' | 'statistical'
    threat_name: str
    severity: str        # 'high' | 'medium' | 'low'
    description: str
    mitigation_recommendation: str


class ValidityAuditor:
    """Audits scientific papers for methodological threats to validity."""

    def audit_threats_to_validity(self, text_content: str, metadata: dict[str, Any] | None = None) -> list[ValidityThreat]:
        threats: list[ValidityThreat] = []
        text_lower = text_content.lower()

        # 1. Internal Validity: check random seeds / baseline fairness
        if "seed" not in text_lower:
            threats.append(ValidityThreat(
                threat_category="internal",
                threat_name="Unfixed Random Seeds",
                severity="medium",
                description="Stochastic variance was not controlled by fixing random seeds across runs.",
                mitigation_recommendation="Report mean ± SD across at least 5 fixed random seeds."
            ))

        # 2. External Validity: check multiple datasets
        dataset_matches = len(re.findall(r"(?i)\b(dataset|benchmark|corpus)\b", text_content))
        if dataset_matches < 2:
            threats.append(ValidityThreat(
                threat_category="external",
                threat_name="Single-Dataset Evaluation",
                severity="high",
                description="Results are evaluated on a single benchmark dataset, limiting generalizability.",
                mitigation_recommendation="Evaluate model performance across at least 3 distinct benchmark datasets."
            ))

        # 3. Statistical Conclusion Validity: check p-value or confidence interval
        if not re.search(r"p\s*<|std|standard deviation|confidence interval|95%", text_lower):
            threats.append(ValidityThreat(
                threat_category="statistical",
                threat_name="Missing Statistical Significance Test",
                severity="high",
                description="No statistical significance test or error bounds (p-value, SD, CI) reported.",
                mitigation_recommendation="Perform paired t-test or Wilcoxon signed-rank test and report p-values."
            ))

        # 4. Construct Validity: check metric definitions
        if "metric" not in text_lower and "accuracy" not in text_lower and "bleu" not in text_lower and "f1" not in text_lower:
            threats.append(ValidityThreat(
                threat_category="construct",
                threat_name="Undefined Measurement Metric",
                severity="medium",
                description="Evaluation metrics are not formally defined in the text.",
                mitigation_recommendation="Provide explicit mathematical definitions for all evaluation metrics."
            ))

        return threats

    def calculate_validity_score(self, threats: list[ValidityThreat]) -> float:
        """Calculate overall validity score from 0.0 (high threats) to 1.0 (rigorous)."""
        penalty = 0.0
        for t in threats:
            if t.severity == "high":
                penalty += 0.25
            elif t.severity == "medium":
                penalty += 0.15
            else:
                penalty += 0.05
        return max(0.0, round(1.0 - penalty, 2))
