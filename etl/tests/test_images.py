import pytest
from checkam_etl.images import is_safe_host, validate_image_url


def test_is_safe_host() -> None:
    assert not is_safe_host("127.0.0.1")
    assert not is_safe_host("localhost")
    assert not is_safe_host("192.168.1.1")
    assert not is_safe_host("10.0.0.1")
    assert not is_safe_host("169.254.169.254")  # AWS metadata


@pytest.mark.asyncio
async def test_validate_image_url_rejects_non_https() -> None:
    assert not await validate_image_url("http://example.com/test.jpg")
    assert not await validate_image_url("javascript:alert(1)")
    assert not await validate_image_url("data:image/png;base64,AAAA")
    assert not await validate_image_url("https://user:pass@example.com/image.png")
    assert not await validate_image_url("https://127.0.0.1/test.png")
