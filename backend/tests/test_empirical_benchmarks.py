"""Unit tests for Empirical Validation & Benchmarking Suite:
1. Gold Standard Dataset (backend/evaluation/datasets/gold_standard.json)
2. Benchmarking Framework (backend/evaluation/benchmark_suite.py)
3. Ablation Study Engine (backend/evaluation/ablation_study.py)
4. Stress Testing Suite (backend/evaluation/stress_tester.py)
"""
import pytest
from evaluation.benchmark_suite import BenchmarkSuite
from evaluation.ablation_study import AblationStudyEngine
from evaluation.stress_tester import StressTestingSuite


def test_gold_standard_dataset_loading():
    suite = BenchmarkSuite()
    assert len(suite.data.get("annotations", [])) >= 3
    first_item = suite.data["annotations"][0]
    assert first_item["venue_target"] == "neurips"


def test_benchmark_suite_head_to_head():
    suite = BenchmarkSuite()
    results = suite.run_full_comparative_benchmark()
    assert len(results["results"]) == 2
    platform_res = results["results"][0]
    raw_res = results["results"][1]
    
    assert platform_res["f1_score"] > raw_res["f1_score"]
    assert platform_res["hallucination_rate"] < raw_res["hallucination_rate"]


def test_ablation_study_engine():
    engine = AblationStudyEngine()
    res = engine.run_ablation_study()
    trials = res["ablation_summary"]
    assert len(trials) == 5
    full_trial = trials[0]
    no_rule_trial = trials[1]
    assert full_trial["f1_score"] > no_rule_trial["f1_score"]


def test_stress_testing_suite():
    tester = StressTestingSuite()
    res = tester.run_all_stress_tests()
    assert res["total_stress_tests"] == 4
    assert res["pass_rate"] == 1.0
