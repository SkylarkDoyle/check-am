import asyncio
import hashlib
import json
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from checkam_etl.settings import settings


class HostRateLimiter:
    def __init__(self, min_delay: float = 2.0) -> None:
        self.min_delay = min_delay
        self._last_call: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def wait(self, host: str) -> None:
        async with self._lock:
            loop = asyncio.get_running_loop()
            now = loop.time()
            last = self._last_call.get(host, 0.0)
            elapsed = now - last
            if elapsed < self.min_delay:
                wait_time = self.min_delay - elapsed
                await asyncio.sleep(wait_time)
            self._last_call[host] = loop.time()


def _is_retryable_error(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or code >= 500
    return False


class CheckAmHttpClient:
    def __init__(self) -> None:
        self.rate_limiter = HostRateLimiter(min_delay=settings.etl_min_delay_seconds)
        self.cache_dir = Path(settings.etl_raw_cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._client: httpx.AsyncClient | None = None

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {
                "User-Agent": settings.etl_user_agent,
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;q=0.9,"
                    "application/json;q=0.8,*/*;q=0.7"
                ),
            }
            self._client = httpx.AsyncClient(
                headers=headers,
                timeout=30.0,
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    def _cache_path(
        self,
        url: str,
        method: str = "GET",
        body: bytes | None = None,
        params: dict[str, Any] | None = None,
    ) -> Path:
        key = f"{method}:{url}"
        if params:
            # Query parameters are part of the identity (paging!), order-independent.
            key += ":" + json.dumps(params, sort_keys=True, default=str)
        if body:
            key += f":{hashlib.sha256(body).hexdigest()}"
        cache_key = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{cache_key}.bin"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception(_is_retryable_error),
        reraise=True,
    )
    async def request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        use_cache: bool = True,
    ) -> httpx.Response:
        body_bytes = json.dumps(data, sort_keys=True, default=str).encode() if data else None
        cache_file = self._cache_path(url, method, body_bytes, params)
        ttl_seconds = settings.etl_cache_ttl_hours * 3600
        fresh = cache_file.exists() and (time.time() - cache_file.stat().st_mtime) < ttl_seconds
        if use_cache and fresh:
            content = cache_file.read_bytes()
            # Return cached response
            return httpx.Response(
                status_code=200, content=content, request=httpx.Request(method, url)
            )

        host = urlparse(url).hostname or "default"
        await self.rate_limiter.wait(host)

        client = await self.get_client()
        resp = await client.request(method, url, params=params, data=data, headers=headers)
        resp.raise_for_status()

        if use_cache and resp.status_code == 200:
            cache_file.write_bytes(resp.content)

        return resp

    async def get(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        *,
        headers: dict[str, str] | None = None,
        use_cache: bool = True,
    ) -> httpx.Response:
        return await self.request("GET", url, params=params, headers=headers, use_cache=use_cache)

    async def post(
        self,
        url: str,
        data: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        use_cache: bool = True,
    ) -> httpx.Response:
        return await self.request("POST", url, data=data, headers=headers, use_cache=use_cache)
