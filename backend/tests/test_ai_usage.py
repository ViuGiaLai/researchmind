import common.ai_usage as usage


def test_estimate_content_tokens_counts_streamed_rows(monkeypatch):
    monkeypatch.setattr(usage, "count_tokens", len)

    tokens, rows = usage.estimate_content_tokens([("abcd",), (None,), ("xy",)])

    assert tokens == 6
    assert rows == 3


def test_estimate_content_tokens_stops_after_allowance(monkeypatch):
    monkeypatch.setattr(usage, "count_tokens", len)
    consumed: list[str] = []

    def rows():
        for value in ("abcd", "efgh", "ignored"):
            consumed.append(value)
            yield (value,)

    tokens, row_count = usage.estimate_content_tokens(rows(), stop_after=5)

    assert tokens == 8
    assert row_count == 2
    assert consumed == ["abcd", "efgh"]
