import json

import pytest

from evaluation.benchmark import run


def write_dataset(tmp_path, cases):
    path = tmp_path / "benchmark.json"
    path.write_text(json.dumps(cases), encoding="utf-8")
    return path


def test_empty_benchmark_is_reported_without_division_by_zero(tmp_path):
    result = run(str(write_dataset(tmp_path, [])))
    assert result == {"cases": 0, "recall_at_k": 0.0, "mrr": 0.0}


def test_benchmark_rejects_invalid_k(tmp_path):
    dataset = [
        {
            "query": "test",
            "relevant_chunk_ids": ["a"],
            "retrieved_chunk_ids": ["a"],
            "k": 0,
        }
    ]
    with pytest.raises(ValueError, match="expected k >= 1"):
        run(str(write_dataset(tmp_path, dataset)))


def test_benchmark_scores_valid_dataset(tmp_path):
    dataset = [
        {
            "query": "test",
            "relevant_chunk_ids": ["a", "b"],
            "retrieved_chunk_ids": ["x", "a", "b"],
            "k": 2,
        }
    ]
    result = run(str(write_dataset(tmp_path, dataset)))
    assert result["cases"] == 1
    assert result["recall_at_k"] == 0.5
    assert result["mrr"] == 0.5
