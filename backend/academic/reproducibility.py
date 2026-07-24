"""Open Science & Reproducibility Evaluator — NeurIPS/ICML reproducibility checklist.

Checklist:
1. Code availability (GitHub/Zenodo URL)
2. Data availability (Public dataset link/DOI)
3. Computing environment (GPU, RAM, OS specs)
4. Hyperparameter documentation
5. Fixation of random seeds
6. Execution pseudocode / algorithm flow
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ReproducibilityChecklist:
    has_code_url: bool
    has_data_url: bool
    has_compute_specs: bool
    has_hyperparameters: bool
    has_fixed_seeds: bool
    has_pseudocode: bool
    reproducibility_score: float  # 0.0 to 1.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "has_code_url": self.has_code_url,
            "has_data_url": self.has_data_url,
            "has_compute_specs": self.has_compute_specs,
            "has_hyperparameters": self.has_hyperparameters,
            "has_fixed_seeds": self.has_fixed_seeds,
            "has_pseudocode": self.has_pseudocode,
            "reproducibility_score": round(self.reproducibility_score, 2),
        }


class ReproducibilityEvaluator:
    """Evaluates paper manuscripts against Open Science & Reproducibility standards."""

    def evaluate_reproducibility(self, text_content: str) -> ReproducibilityChecklist:
        text_lower = text_content.lower()

        has_code_url = bool(re.search(r"github\.com|zenodo\.org|gitlab\.com|code\s+available", text_lower))
        has_data_url = bool(re.search(r"data\s+available|huggingface\.co|kaggle\.com|doi\.org/10\.", text_lower))
        has_compute_specs = bool(re.search(r"gpu|nvidia|v100|a100|h100|rtx|memory|ram", text_lower))
        has_hyperparameters = bool(re.search(r"learning\s+rate|batch\s+size|optimizer|adam|epochs", text_lower))
        has_fixed_seeds = bool(re.search(r"seed|random\s+state", text_lower))
        has_pseudocode = bool(re.search(r"algorithm\s+\d|pseudocode|\\begin\{algorithm\}", text_lower))

        score_parts = [
            0.25 if has_code_url else 0.0,
            0.25 if has_data_url else 0.0,
            0.15 if has_compute_specs else 0.0,
            0.15 if has_hyperparameters else 0.0,
            0.10 if has_fixed_seeds else 0.0,
            0.10 if has_pseudocode else 0.0,
        ]
        score = sum(score_parts)

        return ReproducibilityChecklist(
            has_code_url=has_code_url,
            has_data_url=has_data_url,
            has_compute_specs=has_compute_specs,
            has_hyperparameters=has_hyperparameters,
            has_fixed_seeds=has_fixed_seeds,
            has_pseudocode=has_pseudocode,
            reproducibility_score=score,
        )
