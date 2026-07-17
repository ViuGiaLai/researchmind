import pytest
from fastapi import HTTPException
from starlette.requests import Request

from routers.academic import _validate_public_pdf_url
from routers.settings import ENV_ONLY_KEYS
from routers.system import _require_local_client
from routers.verify import _build_academic_context


def test_user_api_keys_are_not_treated_as_bundle_only_configuration():
    """A desktop user must not lose a key after restarting the application."""
    assert "gemini_api_key" not in ENV_ONLY_KEYS
    assert "openrouter_api_key" not in ENV_ONLY_KEYS


def test_system_file_actions_reject_remote_clients():
    request = Request({"type": "http", "client": ("203.0.113.5", 12345)})
    with pytest.raises(HTTPException) as error:
        _require_local_client(request)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_pdf_proxy_rejects_local_network_targets():
    for url in ("http://127.0.0.1/report.pdf", "http://[::1]/report.pdf"):
        with pytest.raises(HTTPException) as error:
            await _validate_public_pdf_url(url)
        assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_pdf_proxy_accepts_a_public_ip_before_download():
    await _validate_public_pdf_url("https://8.8.8.8/report.pdf")


def test_verify_context_uses_utf8_labels():
    context = _build_academic_context(
        "[Paper A] Nội dung kiểm chứng.",
        [],
        [{"title": "Paper A", "authors": ["Nguyễn Văn A"]}],
    )
    assert "TÀI LIỆU CỦA NGƯỜI DÙNG" in context
    assert "tác giả: Nguyễn Văn A" in context
    assert "Ã" not in context
