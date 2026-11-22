import asyncio
from typing import Any

from checkam_etl.imagesearch.base import Candidate, ProviderError, ProviderThrottled


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_results(raw: list[dict[str, Any]] | None) -> list[Candidate]:
    """Map raw ddgs image results to Candidates, dropping rows without an image link."""
    out: list[Candidate] = []
    for r in raw or []:
        image = str(r.get("image") or "").strip()
        if not image:
            continue
        out.append(
            Candidate(
                image_url=image,
                page_url=str(r.get("url") or "").strip(),
                title=str(r.get("title") or "").strip(),
                width=_to_int(r.get("width")),
                height=_to_int(r.get("height")),
            )
        )
    return out


class DdgsProvider:
    """DuckDuckGo image search through the unofficial `ddgs` package (no API key)."""

    def _search_sync(self, query: str, max_results: int) -> list[dict[str, Any]]:
        from ddgs import DDGS
        from ddgs.exceptions import DDGSException, RatelimitException, TimeoutException

        try:
            return list(DDGS().images(query, max_results=max_results) or [])
        except RatelimitException as exc:
            raise ProviderThrottled(str(exc)) from exc
        except TimeoutException as exc:
            raise ProviderError(f"timeout: {exc}") from exc
        except DDGSException as exc:
            # ddgs raises "No results found"; that is an empty result, not a failure.
            if "no results" in str(exc).lower():
                return []
            raise ProviderError(str(exc)) from exc

    async def search(self, query: str, max_results: int = 8) -> list[Candidate]:
        raw = await asyncio.to_thread(self._search_sync, query, max_results)
        return parse_results(raw)
