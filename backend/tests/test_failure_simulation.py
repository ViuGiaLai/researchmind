import httpx

from chat.citation_entailment import MultilingualEntailmentVerifier
from chat.failure_policy import classify_failure


def _status_error(code: int):
    request = httpx.Request("POST", "https://provider.invalid")
    response = httpx.Response(code, request=request)
    return httpx.HTTPStatusError("failure", request=request, response=response)
def test_failure_policy_simulates_timeout_429_500_and_auth():
    assert classify_failure(httpx.ReadTimeout("slow")) == {"kind":"timeout","retryable":True}
    assert classify_failure(_status_error(429)) == {"kind":"rate_limit","retryable":True}
    assert classify_failure(_status_error(500)) == {"kind":"server","retryable":True}
    assert classify_failure(_status_error(401)) == {"kind":"authentication","retryable":False}
def test_multilingual_nli_has_offline_fallback(monkeypatch):
    verifier = MultilingualEntailmentVerifier()
    verifier._load_attempted = True
    result = verifier.verify("Kết quả được cải thiện", "Nghiên cứu cho thấy kết quả được cải thiện đáng kể")
    assert result["method"] == "lexical_fallback"
    assert result["label"] in {"entailed", "partial"}
