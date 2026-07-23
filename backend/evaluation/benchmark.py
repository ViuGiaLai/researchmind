"""Reproducible offline benchmark runner and quality gate."""

import argparse
import json
from pathlib import Path

from evaluation.rag_evaluator import RagCase, evaluate_case


def run(path: str) -> dict:
    raw_cases = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw_cases, list):
        raise ValueError("Benchmark dataset must be a JSON array")
    if not raw_cases:
        return {"cases": 0, "recall_at_k": 0.0, "mrr": 0.0}

    scores = []
    for index, case in enumerate(raw_cases):
        if not isinstance(case, dict):
            raise ValueError(f"Benchmark case {index} must be an object")
        try:
            query = str(case["query"])
            relevant = set(case["relevant_chunk_ids"])
            retrieved = list(case["retrieved_chunk_ids"])
            k = int(case.get("k", 5))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Invalid benchmark case at index {index}: {exc}") from exc
        if k < 1:
            raise ValueError(f"Benchmark case {index} has invalid k={k}; expected k >= 1")
        scores.append(evaluate_case(RagCase(query, relevant), retrieved, k))

    return {
        "cases": len(scores),
        "recall_at_k": sum(score["recall_at_k"] for score in scores) / len(scores),
        "mrr": sum(score["mrr"] for score in scores) / len(scores),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset")
    parser.add_argument("--min-recall", type=float, default=0.7)
    parser.add_argument("--min-mrr", type=float, default=0.6)
    args = parser.parse_args()
    result = run(args.dataset)
    print(json.dumps(result, indent=2))
    raise SystemExit(
        0
        if result["cases"] > 0
        and result["recall_at_k"] >= args.min_recall
        and result["mrr"] >= args.min_mrr
        else 1
    )


if __name__ == "__main__":
    main()
