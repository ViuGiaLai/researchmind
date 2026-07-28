"""Reasoning Engine — rule-based academic deduction and logic synthesis based on ontology.

Performs logic deduction without relying solely on LLMs:
- SOTA performance deduction across methods/datasets/metrics.
- Conflict & contradiction detection between paper claims.
- Evidence gap & unverified assertion identification.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .ontology import AcademicOntologyGraph, ExperimentEntity


@dataclass
class DeductedFact:
    fact_type: str  # 'sota_claim' | 'evidence_conflict' | 'unsupported_assertion' | 'method_advancement'
    statement: str
    paper_ids: list[str] = field(default_factory=list)
    confidence: float = 0.0
    reasoning_chain: list[str] = field(default_factory=list)


class AcademicReasoningEngine:
    """Rule-based deduction engine working on AcademicOntologyGraph."""

    def __init__(self, ontology: AcademicOntologyGraph | None = None):
        self.ontology = ontology or AcademicOntologyGraph()

    def deduce_sota_claims(self) -> list[DeductedFact]:
        """Identify unique observed benchmark leaders without asserting global SOTA."""
        deductions: list[DeductedFact] = []
        # Group experiments by (dataset_name, metric_name)
        grouped: dict[tuple[str, str], list[ExperimentEntity]] = {}
        for exp in self.ontology.experiments.values():
            key = (exp.dataset_name.lower(), exp.metric_name.lower())
            grouped.setdefault(key, []).append(exp)

        lower_is_better_terms = ("loss", "error", "latency", "delay", "far", "fpr", "mae", "mse", "rmse")
        for (ds, metric), exp_list in grouped.items():
            distinct_methods = {exp.method_name.casefold() for exp in exp_list}
            if len(distinct_methods) < 2:
                continue

            metric_entity = next(
                (item for item in self.ontology.metrics.values() if item.name.casefold() == metric),
                None,
            )
            lower_is_better = any(term in metric for term in lower_is_better_terms)
            higher_is_better = not lower_is_better
            if metric_entity is not None and not lower_is_better:
                higher_is_better = metric_entity.higher_is_better

            best_value = max(exp.value for exp in exp_list) if higher_is_better else min(exp.value for exp in exp_list)
            winners = [exp for exp in exp_list if exp.value == best_value]
            if len(winners) != 1:
                continue

            best_exp = winners[0]
            direction = "highest" if higher_is_better else "lowest"
            deductions.append(
                DeductedFact(
                    fact_type="sota_claim",
                    statement=(
                        f"Method '{best_exp.method_name}' has the {direction} observed value "
                        f"on '{best_exp.dataset_name}' for '{best_exp.metric_name}' ({best_exp.value}) "
                        f"among {len(exp_list)} indexed experiments; this does not establish global SOTA."
                    ),
                    paper_ids=[best_exp.paper_id],
                    confidence=0.70,
                    reasoning_chain=[
                        f"Compared {len(exp_list)} indexed experiments across {len(distinct_methods)} methods.",
                        f"Metric direction: {'higher' if higher_is_better else 'lower'} is better.",
                    ],
                )
            )

        return deductions

    def detect_evidence_conflicts(self) -> list[DeductedFact]:
        """Detect contradictions between empirical claims across papers."""
        conflicts: list[DeductedFact] = []
        claims = list(self.ontology.claims.values())

        # Simple claim collision matching logic based on terms
        for i in range(len(claims)):
            for j in range(i + 1, len(claims)):
                c1, c2 = claims[i], claims[j]
                if c1.paper_id == c2.paper_id:
                    continue

                # Check for antonyms or contradictory indicators
                words1 = set(c1.statement.lower().split())
                words2 = set(c2.statement.lower().split())
                common = words1.intersection(words2)

                if len(common) >= 3 and (
                    ("improves" in words1 and "degrades" in words2)
                    or ("outperforms" in words1 and "underperforms" in words2)
                ):
                    conflicts.append(
                        DeductedFact(
                            fact_type="evidence_conflict",
                            statement=f"Contradiction detected between Claim in Paper [{c1.paper_id}] and Claim in Paper [{c2.paper_id}].",
                            paper_ids=[c1.paper_id, c2.paper_id],
                            confidence=0.88,
                            reasoning_chain=[
                                f"Claim 1: '{c1.statement}'",
                                f"Claim 2: '{c2.statement}'",
                                "Directly opposing statements found on shared topics.",
                            ],
                        )
                    )
        return conflicts

    def identify_unsupported_assertions(self) -> list[DeductedFact]:
        """Identify claims that have no associated supporting evidence."""
        unsupported: list[DeductedFact] = []
        evidence_paper_ids = {ev.paper_id for ev in self.ontology.evidence.values()}

        for claim in self.ontology.claims.values():
            if not claim.supported or claim.paper_id not in evidence_paper_ids:
                unsupported.append(
                    DeductedFact(
                        fact_type="unsupported_assertion",
                        statement=f"Claim '{claim.statement}' in Paper [{claim.paper_id}] lacks supporting evidence passage.",
                        paper_ids=[claim.paper_id],
                        confidence=0.90,
                        reasoning_chain=[
                            f"Inspected evidence records for paper '{claim.paper_id}'.",
                            "No corresponding passage found supporting this claim.",
                        ],
                    )
                )
        return unsupported

    def run_full_reasoning_cycle(self) -> dict[str, list[DeductedFact]]:
        return {
            "sota_claims": self.deduce_sota_claims(),
            "conflicts": self.detect_evidence_conflicts(),
            "unsupported_assertions": self.identify_unsupported_assertions(),
        }
