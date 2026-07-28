"""Unit tests for local_provider.py helpers and mixin functionality."""

from chat.generator_v2 import Generator
from chat.providers.local_provider import (
    LOCAL_MODE_CAPS,
    MAX_LOCAL_NTOKENS,
    MIN_LOCAL_NTOKENS,
    _filter_think_tags,
    _strip_think_tags,
)


def test_strip_think_tags():
    assert _strip_think_tags("<think>internal thought</think>\nHello world!") == "Hello world!"
    assert _strip_think_tags("No think tags here") == "No think tags here"
    assert _strip_think_tags("</think>Leading end tag") == "Leading end tag"
    assert _strip_think_tags("<think>t1</think>Part 1<think>t2</think>Part 2") == "Part 1Part 2"


def test_filter_think_tags_single_chunk():
    text, in_think = _filter_think_tags("<think>secret</think>Public answer", False)
    assert text == "Public answer"
    assert in_think is False


def test_filter_think_tags_multi_chunk():
    text1, in_think1 = _filter_think_tags("<think>part1", False)
    assert text1 == ""
    assert in_think1 is True

    text2, in_think2 = _filter_think_tags("part2</think>Answer text", in_think1)
    assert text2 == "Answer text"
    assert in_think2 is False


def test_resolve_ntokens():
    gen = Generator(mode="local", local_max_tokens=512)
    gen._local.reasoning_mode = "fast"
    gen._local.task_type = "chat"
    assert gen._resolve_ntokens(None) == LOCAL_MODE_CAPS["fast"]

    gen._local.reasoning_mode = "continue"
    assert gen._resolve_ntokens(None) == LOCAL_MODE_CAPS["continue"]

    gen._local.reasoning_mode = "deep_plus"
    assert gen._resolve_ntokens(2048) == MAX_LOCAL_NTOKENS

    gen._local.reasoning_mode = "fast"
    assert gen._resolve_ntokens(32) == MIN_LOCAL_NTOKENS


def test_build_local_chat_messages():
    gen = Generator(mode="local")
    gen._local.chat_history = [
        {"role": "user", "content": "Prev Q"},
        {"role": "assistant", "content": "Prev A"},
        "invalid_non_dict",
    ]
    messages = gen._build_local_chat_messages("System prompt", "Current prompt")
    assert len(messages) == 4
    assert messages[0] == {"role": "system", "content": "System prompt"}
    assert messages[1] == {"role": "user", "content": "Prev Q"}
    assert messages[2] == {"role": "assistant", "content": "Prev A"}
    assert messages[3] == {"role": "user", "content": "Current prompt"}
