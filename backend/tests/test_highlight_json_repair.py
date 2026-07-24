from routers.papers import _parse_highlights_json


def test_truncated_highlight_array_salvages_complete_objects():
    content = (
        '[{"category":"important_claim","text":"Large Language Models (LLMs)",'
        '"page_hint":6,"importance":"high","note":"Core concept"},'
        '{"category":"key_finding","text":"truncated'
    )
    highlights = _parse_highlights_json(content)
    assert highlights == [
        {
            "category": "important_claim",
            "text": "Large Language Models (LLMs)",
            "page_hint": 6,
            "importance": "high",
            "note": "Core concept",
        }
    ]


def test_highlight_parser_accepts_json_fence():
    fence = chr(96) * 3
    content = (
        fence
        + 'json\n[{"category":"key_finding","text":"Finding","page_hint":1,"importance":"high","note":"Reason"}]\n'
        + fence
    )
    assert _parse_highlights_json(content)[0]["text"] == "Finding"
