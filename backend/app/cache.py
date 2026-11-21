import asyncio
import time
from typing import Any, Protocol


class Cache(Protocol):
    async def get(self, key: str) -> Any | None: ...

    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None: ...

    async def delete(self, key: str) -> None: ...

    async def check_rate_limit(
        self, client_id: str, limit: int = 60, window_seconds: int = 60
    ) -> bool: ...


class InMemoryTTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}
        self._rate_limits: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            if key not in self._store:
                return None
            val, expires_at = self._store[key]
            if time.time() > expires_at:
                del self._store[key]
                return None
            return val

    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        async with self._lock:
            self._store[key] = (value, time.time() + ttl_seconds)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def check_rate_limit(
        self, client_id: str, limit: int = 60, window_seconds: int = 60
    ) -> bool:
        """Returns True if request is allowed, False if rate limited."""
        now = time.time()
        cutoff = now - window_seconds
        async with self._lock:
            timestamps = self._rate_limits.setdefault(client_id, [])
            # Purge expired timestamps
            valid = [ts for ts in timestamps if ts > cutoff]
            if len(valid) >= limit:
                self._rate_limits[client_id] = valid
                return False
            valid.append(now)
            self._rate_limits[client_id] = valid
            return True


_cache: Cache = InMemoryTTLCache()


def get_cache() -> Cache:
    return _cache
