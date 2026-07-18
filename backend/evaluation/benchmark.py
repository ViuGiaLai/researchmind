"""Reproducible offline benchmark runner and quality gate."""
import argparse
import json
from pathlib import Path
from evaluation.rag_evaluator import RagCase, evaluate_case
def run(path: str) -> dict:
    cases = json.loads(Path(path).read_text(encoding="utf-8"))
    scores = [evaluate_case(RagCase(c["query"], set(c["relevant_chunk_ids"])), c["retrieved_chunk_ids"], c.get("k", 5)) for c in cases]
    return {"cases": len(scores), "recall_at_k": sum(s["recall_at_k"] for s in scores) / len(scores), "mrr": sum(s["mrr"] for s in scores) / len(scores)}
def main():
    parser = argparse.ArgumentParser(); parser.add_argument("dataset")
    parser.add_argument("--min-recall", type=float, default=0.7); parser.add_argument("--min-mrr", type=float, default=0.6)
    args = parser.parse_args(); result = run(args.dataset); print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["recall_at_k"] >= args.min_recall and result["mrr"] >= args.min_mrr else 1)
if __name__ == "__main__": main()
