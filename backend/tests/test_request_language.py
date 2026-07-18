from starlette.requests import Request

from common.i18n import (
    get_language,
    get_language_instruction,
    get_prompt_language,
    set_request_language,
)


def _request(headers: list[tuple[bytes, bytes]]) -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def test_accept_language_selects_supported_language_by_preference():
    request = _request([(b"accept-language", b"fr-FR, en-US;q=0.9, vi;q=0.8")])
    assert get_language(request) == "en"


def test_x_language_overrides_accept_language_for_legacy_clients():
    request = _request([
        (b"x-language", b"vi"),
        (b"accept-language", b"en-US,en;q=0.9"),
    ])
    assert get_language(request) == "vi"


def test_request_language_reaches_prompt_instruction():
    try:
        set_request_language("en-US")
        assert get_prompt_language("Vietnamese query") == "en"
        assert "Write the complete response in English." in get_language_instruction("Vietnamese query")
    finally:
        set_request_language("")


def test_unsupported_request_language_falls_back_safely():
    request = _request([(b"accept-language", b"ar, fr;q=0.9")])
    assert get_language(request) == "vi"
