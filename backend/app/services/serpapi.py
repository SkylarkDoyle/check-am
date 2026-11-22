"""SerpApi Google AI Mode client and answer normaliser.

The browser never sees SerpApi's raw response (or the key). We turn `text_blocks` and
`references` into a small plain-text structure and strip what would mislead a Nigerian shopper:
phone numbers (the answers quote foreign consumer hotlines) and the chatty closing line.
"""

import asyncio
import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from app.reg import looks_like_reg, normalize_reg
from app.settings import settings

MAX_BLOCKS = 40
MAX_CHARS = 4000
MAX_SOURCES = 8
MIN_USEFUL_CHARS = 200

_TAGS = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")
_PHONE = re.compile(r"(?<![\w-])\+?\d[\d\s().-]{7,}\d(?![\w-])")
# Social platforms are not sources a shopper should be sent to as evidence.
_BLOCKED_SOURCE_HOSTS = (
    "facebook.com",
    "fb.com",
    "instagram.com",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "pinterest.com",
    "reddit.com",
    "whatsapp.com",
    "t.me",
)
_CHATTY = re.compile(
    r"\b(tell me|let me know|if you have|would you like|feel free|i can help|we can check)\b", re.I
)


class ProviderError(Exception):
    """The provider failed or refused. The message is safe to log (never contains the key)."""


def build_query(user_query: str) -> str:
    """The question sent to the provider, focused on Nigeria and NAFDAC."""
    q = _SPACES.sub(" ", user_query).strip()
    if looks_like_reg(q):
        reg = q.upper()
        return (
            f"Product with NAFDAC registration number {reg} in Nigeria: what is it, "
            "and what does its "
            "genuine packaging look like?"
        )
    return (
        f"What does the genuine {q} packaging sold in Nigeria look like, and what are common signs "
        "of counterfeit versions? Focus on NAFDAC-registered products."
    )


def _plain(text: Any) -> str:
    if not isinstance(text, str):
        return ""
    return _SPACES.sub(" ", _TAGS.sub("", text)).strip()


def _has_phone(text: str) -> bool:
    return any(sum(ch.isdigit() for ch in m.group(0)) >= 9 for m in _PHONE.finditer(text))


def _clean_items(items: Any, budget: list[int]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        text = _plain(item.get("snippet"))
        if not text or _has_phone(text) or _CHATTY.search(text):
            continue
        if budget[0] + len(text) > MAX_CHARS:
            break
        budget[0] += len(text)
        entry: dict[str, Any] = {"text": text}
        children = _clean_items(item.get("list"), budget)
        if children:
            entry["items"] = children
        out.append(entry)
    return out


def normalize_response(raw: dict[str, Any], query: str) -> dict[str, Any]:
    """Turn a SerpApi google_ai_mode response into our schema. `result` is 'ok' or 'none'."""
    budget = [0]
    blocks: list[dict[str, Any]] = []
    for block in raw.get("text_blocks") or []:
        if len(blocks) >= MAX_BLOCKS or not isinstance(block, dict):
            break
        kind = block.get("type")
        if kind in ("heading", "paragraph"):
            text = _plain(block.get("snippet"))
            if not text or _has_phone(text):
                continue
            if kind == "paragraph" and _CHATTY.search(text):
                continue
            if budget[0] + len(text) > MAX_CHARS:
                break
            budget[0] += len(text)
            blocks.append({"type": kind, "text": text})
        elif kind == "list":
            items = _clean_items(block.get("list"), budget)
            if items:
                blocks.append({"type": "list", "items": items})

    # A heading with nothing after it is noise.
    cleaned: list[dict[str, Any]] = []
    for i, b in enumerate(blocks):
        if b["type"] == "heading" and (i + 1 >= len(blocks) or blocks[i + 1]["type"] == "heading"):
            continue
        cleaned.append(b)

    sources: list[dict[str, str]] = []
    for ref in raw.get("references") or []:
        if not isinstance(ref, dict):
            continue
        url = ref.get("link")
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        host = (urlparse(url).hostname or "").lower()
        if any(host == b or host.endswith("." + b) for b in _BLOCKED_SOURCE_HOSTS):
            continue
        icon = ref.get("source_icon")
        sources.append(
            {
                "title": _plain(ref.get("title"))[:160],
                "source": _plain(ref.get("source"))[:80],
                "url": url,
                **({"icon": icon} if isinstance(icon, str) and icon.startswith("https://") else {}),
            }
        )
        if len(sources) >= MAX_SOURCES:
            break

    total_text = sum(len(str(b)) for b in cleaned)
    useful = bool(cleaned) and (bool(sources) or total_text >= MIN_USEFUL_CHARS)
    return {
        "query": query,
        "result": "ok" if useful else "none",
        "blocks": cleaned if useful else [],
        "sources": sources if useful else [],
    }


def _check_error(data: dict[str, Any]) -> None:
    err = data.get("error")
    if err:
        raise ProviderError(f"provider error: {_plain(str(err))[:160]}")
    status = (data.get("search_metadata") or {}).get("status")
    if status == "Error":
        raise ProviderError("provider reported an error")


async def search(query: str, client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    """Run one Google AI Mode search. Polls if the provider answers 'Processing'."""
    key = settings.serpapi_api_key
    if not key:
        raise ProviderError("no provider key configured")
    params = {
        "engine": "google_ai_mode",
        "q": build_query(query),
        "api_key": key,
        "hl": "en",
        "gl": "ng",
    }
    owns = client is None
    http = client or httpx.AsyncClient(timeout=settings.ai_timeout_seconds)
    try:
        resp = await http.get(settings.serpapi_url, params=params)
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        _check_error(data)

        meta = data.get("search_metadata") or {}
        deadline = time.monotonic() + settings.ai_poll_seconds
        while meta.get("status") in ("Processing", "Queued"):
            endpoint = meta.get("json_endpoint")
            if not endpoint or time.monotonic() > deadline:
                raise ProviderError("provider took too long")
            await asyncio.sleep(1.0)
            poll = await http.get(endpoint, params={"api_key": key})
            poll.raise_for_status()
            data = poll.json()
            _check_error(data)
            meta = data.get("search_metadata") or {}
        return data
    except httpx.HTTPStatusError as exc:
        # Never include exc.request.url: it carries the api_key.
        raise ProviderError(f"provider returned HTTP {exc.response.status_code}") from None
    except httpx.TimeoutException:
        raise ProviderError("provider timed out") from None
    except httpx.HTTPError as exc:
        raise ProviderError(f"provider connection failed ({type(exc).__name__})") from None
    except ValueError:
        raise ProviderError("provider sent an unreadable response") from None
    finally:
        if owns:
            await http.aclose()


def cache_key(user_query: str, version: int) -> str:
    """Normalised cache key: the same question in any casing or punctuation shares one row."""
    q = _SPACES.sub(" ", user_query).strip()
    if looks_like_reg(q):
        return f"v{version}:reg:{normalize_reg(q)}"
    return f"v{version}:" + _SPACES.sub(" ", re.sub(r"[^a-z0-9]+", " ", q.lower())).strip()
