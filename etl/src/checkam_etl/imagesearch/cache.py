"""On-disk cache of search results, so re-runs and threshold tuning never re-query the provider.

A dry run fills the cache; the real run that follows reuses it at no cost. Only successful
searches are cached (including empty ones); errors and throttling never are.
"""

import hashlib
import json
import time
from pathlib import Path

from checkam_etl.imagesearch.base import Candidate, ImageSearchProvider


class CachedProvider:
    def __init__(
        self,
        inner: ImageSearchProvider,
        cache_dir: Path,
        ttl_days: float = 14.0,
        enabled: bool = True,
    ) -> None:
        self.inner = inner
        self.cache_dir = cache_dir
        self.ttl_seconds = ttl_days * 86400
        self.enabled = enabled
        self.hits = 0
        self.misses = 0

    def _path(self, query: str, max_results: int) -> Path:
        digest = hashlib.sha256(f"{query.lower()}|{max_results}".encode()).hexdigest()
        return self.cache_dir / f"{digest}.json"

    def peek(self, query: str, max_results: int = 8) -> list[Candidate] | None:
        """Cached candidates for this query, or None. Costs no provider call."""
        if not self.enabled:
            return None
        path = self._path(query, max_results)
        try:
            if time.time() - path.stat().st_mtime > self.ttl_seconds:
                return None
            raw = json.loads(path.read_text(encoding="utf-8"))
            self.hits += 1
            return [Candidate(**item) for item in raw]
        except (OSError, ValueError, TypeError):
            return None

    async def search(self, query: str, max_results: int = 8) -> list[Candidate]:
        cached = self.peek(query, max_results)
        if cached is not None:
            return cached
        self.misses += 1
        result = await self.inner.search(query, max_results)
        if self.enabled:
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                payload = [
                    {
                        "image_url": c.image_url,
                        "page_url": c.page_url,
                        "title": c.title,
                        "width": c.width,
                        "height": c.height,
                    }
                    for c in result
                ]
                self._path(query, max_results).write_text(json.dumps(payload), encoding="utf-8")
            except OSError:
                pass  # a cache write failure must never fail the run
        return result
