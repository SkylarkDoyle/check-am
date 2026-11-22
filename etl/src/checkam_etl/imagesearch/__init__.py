from checkam_etl.imagesearch.base import (
    Candidate,
    ImageSearchProvider,
    ProviderError,
    ProviderThrottled,
)

__all__ = [
    "Candidate",
    "ImageSearchProvider",
    "ProviderError",
    "ProviderThrottled",
    "get_provider",
]


def get_provider(name: str) -> ImageSearchProvider:
    """Return the configured image search provider (IMAGE_PROVIDER)."""
    if name == "ddgs":
        from checkam_etl.imagesearch.ddgs_provider import DdgsProvider

        return DdgsProvider()
    raise ValueError(f"Unknown image provider {name!r}; supported: ddgs")
