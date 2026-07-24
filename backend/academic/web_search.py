import asyncio

from duckduckgo_search import DDGS


async def search_web(query: str, max_results: int = 5) -> list[dict]:
    def _sync():
        try:
            with DDGS() as ddgs:
                results = []
                for r in ddgs.text(query, max_results=max_results):
                    results.append(
                        {
                            "title": r.get("title", ""),
                            "url": r.get("href", ""),
                            "snippet": r.get("body", ""),
                        }
                    )
                return results
        except Exception:
            return []

    return await asyncio.to_thread(_sync)


async def search_news(query: str, max_results: int = 3) -> list[dict]:
    def _sync():
        try:
            with DDGS() as ddgs:
                results = []
                for r in ddgs.news(query, max_results=max_results):
                    results.append(
                        {
                            "title": r.get("title", ""),
                            "url": r.get("url", ""),
                            "snippet": r.get("body", ""),
                            "date": r.get("date", ""),
                        }
                    )
                return results
        except Exception:
            return []

    return await asyncio.to_thread(_sync)
