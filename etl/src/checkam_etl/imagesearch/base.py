from dataclasses import dataclass
from typing import Protocol


class ProviderError(Exception):
    """The provider failed for a reason that may be transient."""


class ProviderThrottled(ProviderError):
    """The provider is rate-limiting or blocking us. Back off; never try to bypass it."""


@dataclass(frozen=True)
class Candidate:
    image_url: str
    page_url: str
    title: str
    width: int | None = None
    height: int | None = None

    @property
    def source_domain(self) -> str:
        from urllib.parse import urlparse

        return (urlparse(self.page_url).hostname or urlparse(self.image_url).hostname or "").lower()


class ImageSearchProvider(Protocol):
    async def search(self, query: str, max_results: int = 8) -> list[Candidate]: ...
