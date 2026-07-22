"""
ResearchMind VN — PapersWithCode API Client.

Integrates with PapersWithCode REST API to fetch:
- SOTA evaluation benchmarks & leaderboards
- Research tasks & datasets
- Code implementations & paper results
"""

import json
import urllib.parse
import urllib.request
from typing import Any
try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger("paperswithcode")
from academic.cache import cache_get, cache_set

PWC_BASE_URL = "https://paperswithcode.com/api/v1"

def _fetch_json(endpoint: str, params: dict[str, Any] | None = None, timeout: int = 8) -> dict[str, Any] | None:
    """Helper to execute GET request to PapersWithCode API."""
    url = f"{PWC_BASE_URL}/{endpoint.lstrip('/')}"
    if params:
        query_str = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        if query_str:
            url += f"?{query_str}"
            
    cached = cache_get(url, 86400)
    if cached:
        return cached

    req = urllib.request.Request(url, headers={"User-Agent": "ResearchMind/0.6.0 (Academic Assistant)"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                cache_set(url, "paperswithcode", data)
                return data
    except Exception as e:
        logger.warning(f"PapersWithCode API call failed [{url}]: {e}")
    return None


def search_tasks(query: str, page: int = 1, items_per_page: int = 5) -> list[dict[str, Any]]:
    """Search tasks on PapersWithCode (e.g. 'Named Entity Recognition', 'Image Classification')."""
    res = _fetch_json("tasks/", {"q": query, "page": page, "items_per_page": items_per_page})
    if not res or "results" not in res:
        return []
    return [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "description": item.get("description", ""),
            "area": item.get("area", ""),
        }
        for item in res["results"]
    ]


def get_task_benchmarks(task_id: str) -> list[dict[str, Any]]:
    """Fetch evaluation tables/benchmarks for a given task ID."""
    res = _fetch_json(f"tasks/{task_id}/eval-tables/")
    if not res or "results" not in res:
        return []
    
    benchmarks = []
    for item in res["results"]:
        benchmarks.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "dataset": item.get("dataset", ""),
            "metric": item.get("metric_name", ""),
            "sota_value": item.get("sota_result_value"),
            "paper_title": item.get("sota_result_paper_title"),
        })
    return benchmarks


def search_paper_results(paper_title: str) -> list[dict[str, Any]]:
    """Search if a paper title has benchmark results on PapersWithCode."""
    res = _fetch_json("papers/", {"q": paper_title, "items_per_page": 3})
    if not res or "results" not in res:
        return []
    
    out = []
    for p in res["results"]:
        paper_id = p.get("id")
        if not paper_id:
            continue
        # Get evaluation results for this paper
        eval_res = _fetch_json(f"papers/{paper_id}/results/")
        results_list = []
        if eval_res and "results" in eval_res:
            for r in eval_res["results"]:
                results_list.append({
                    "task": r.get("task"),
                    "dataset": r.get("dataset"),
                    "metric": r.get("metric_name"),
                    "value": r.get("metric_value"),
                    "rank": r.get("rank"),
                })
        out.append({
            "id": paper_id,
            "title": p.get("title"),
            "url": p.get("url_abs"),
            "results": results_list,
        })
    return out
