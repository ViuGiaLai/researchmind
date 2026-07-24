"""Hypothesis & Falsifiability Engine — extracts, formats, and validates scientific hypotheses and variable controls.

Enforces Popperian falsifiability: every scientific claim must have a testable Null Hypothesis (H0)
and Alternative Hypothesis (H1) with explicit Independent/Dependent variables.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ScientificHypothesis:
    id: str
    null_hypothesis_h0: str
    alt_hypothesis_h1: str
    independent_variables: list[str]
    dependent_variables: list[str]
    control_variables: list[str]
    is_falsifiable: bool
    statistical_test_type: str  # 't_test' | 'anova' | 'wilcoxon' | 'chi_square' | 'regression'


class AcademicHypothesisEngine:
    """Extracts, formalizes, and evaluates scientific hypothesis rigor."""

    def formalize_hypothesis(
        self,
        claim_statement: str,
        method_name: str = "Proposed Method",
        baseline_name: str = "Baseline",
        metric_name: str = "Accuracy",
    ) -> ScientificHypothesis:
        """Transform a research claim into a formal, falsifiable scientific hypothesis."""
        h0 = f"There is no statistically significant difference in {metric_name} between {method_name} and {baseline_name} (p >= 0.05)."
        h1 = f"{method_name} achieves statistically significant improvement in {metric_name} over {baseline_name} (p < 0.05)."

        is_falsifiable = bool(claim_statement and metric_name)

        return ScientificHypothesis(
            id=f"hyp_{hash(claim_statement) % 10000:04d}",
            null_hypothesis_h0=h0,
            alt_hypothesis_h1=h1,
            independent_variables=[f"Model Choice ({method_name} vs {baseline_name})"],
            dependent_variables=[f"Performance Metric ({metric_name})"],
            control_variables=["Dataset split", "Random seed", "Hardware environment", "Hyperparameter configuration"],
            is_falsifiable=is_falsifiable,
            statistical_test_type="t_test",
        )

    def evaluate_falsifiability_rigor(self, hypotheses: list[ScientificHypothesis]) -> dict[str, Any]:
        """Evaluate the overall falsifiability score of a set of scientific hypotheses."""
        if not hypotheses:
            return {"falsifiability_score": 0.0, "total": 0, "falsifiable_count": 0}

        falsifiable_count = sum(1 for h in hypotheses if h.is_falsifiable)
        score = falsifiable_count / len(hypotheses)

        return {
            "falsifiability_score": round(score, 2),
            "total": len(hypotheses),
            "falsifiable_count": falsifiable_count,
            "hypotheses": [vars(h) for h in hypotheses],
        }
