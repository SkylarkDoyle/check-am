import os
import time
from pathlib import Path

import httpx
import pytest
from checkam_etl.http import CheckAmHttpClient


def _client(tmp_path: Path) -> CheckAmHttpClient:
    c = CheckAmHttpClient()
    c.cache_dir = tmp_path
    return c


def test_cache_key_includes_query_params(tmp_path: Path) -> None:
    c = _client(tmp_path)
    url = "https://example.test/data"
    p1 = c._cache_path(url, params={"start": 0})
    p2 = c._cache_path(url, params={"start": 100})
    p3 = c._cache_path(url, params={"start": 0})
    assert p1 != p2
    assert p1 == p3


@pytest.mark.asyncio
async def test_stale_cache_is_refetched(tmp_path: Path) -> None:
    c = _client(tmp_path)
    c.rate_limiter.min_delay = 0
    url = "https://example.test/data"
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, content=b"fresh")

    c._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await c.get(url, params={"start": 0})
    await c.get(url, params={"start": 0})
    assert calls["n"] == 1  # second call served from fresh cache
    await c.get(url, params={"start": 100})
    assert calls["n"] == 2  # different page is a different cache entry

    old = time.time() - 48 * 3600
    for f in tmp_path.glob("*.bin"):
        os.utime(f, (old, old))
    await c.get(url, params={"start": 0})
    assert calls["n"] == 3  # expired entry refetched
    await c.close()
