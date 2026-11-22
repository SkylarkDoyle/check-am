import asyncio
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.db import get_db_connection
from app.schemas import AiLookupRequest, AiLookupResponse, AiUsage, AiUsageResponse
from app.services import ai_cache, ai_limits, serpapi
from app.settings import settings

router = APIRouter(prefix="/ai-lookup", tags=["ai-lookup"])

_DEVICE_ID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_SPACES = re.compile(r"\s+")

# One in-flight lookup per question per instance, so two people asking the same thing at the same
# moment pay for one provider call. (Across instances the unique cache key still limits damage.)
_locks: dict[str, asyncio.Lock] = {}


class ApiError(Exception):
    """Turned into {"error": {...}} by the endpoints below.

    Raising HTTPException would be wrapped as {"detail": ...} when this router is reached through
    the mounted /api/v1 sub-app (which does not share the main app's error handlers).
    """

    def __init__(self, code: str, message: str, http_status: int, **extra: Any) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.body = {"error": {"code": code, "message": message, **extra}}

    def response(self) -> JSONResponse:
        return JSONResponse(status_code=self.http_status, content=self.body)


def _error(code: str, message: str, http_status: int, **extra: Any) -> ApiError:
    return ApiError(code, message, http_status, **extra)


def _device_id(value: str | None) -> str:
    if not value or not _DEVICE_ID.match(value):
        raise _error("AI_DEVICE_REQUIRED", "A valid X-Device-Id header is required.", 422)
    return value.lower()


def _clean_query(raw: str) -> str:
    q = _SPACES.sub(" ", raw).strip()
    if _CONTROL.search(raw):
        raise _error("INVALID_QUERY", "Query contains invalid characters.", 422)
    if not (3 <= len(q) <= 80) or not any(c.isalnum() for c in q):
        raise _error(
            "INVALID_QUERY", "Enter 3 to 80 characters with at least one letter or number.", 422
        )
    return q


def _client_ip(request: Request) -> str:
    # Behind a proxy the first X-Forwarded-For hop is the caller. It can be spoofed, which is why
    # the IP counter is only a generous backstop and the global cap is the real protection.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _usage(device: str) -> AiUsage:
    async with get_db_connection() as conn:
        used = await ai_limits.used(conn, "device", device)
    limit = settings.ai_daily_limit_per_device
    return AiUsage(
        limit=limit, remaining=max(limit - used, 0), resets_at=ai_limits.resets_at().isoformat()
    )


def _response(
    query: str,
    status_: str,
    result: dict[str, Any],
    cached: bool,
    usage: AiUsage,
    generated_at: Any,
) -> AiLookupResponse:
    return AiLookupResponse(
        query=query,
        result="ok" if status_ == "ok" else "none",
        cached=cached,
        generated_at=generated_at.isoformat()
        if isinstance(generated_at, datetime)
        else generated_at,
        blocks=result.get("blocks", []),
        sources=result.get("sources", []),
        usage=usage,
    )


@router.get("/usage", response_model=AiUsageResponse)
async def get_usage(x_device_id: str | None = Header(default=None, alias="X-Device-Id")) -> Any:
    """How many lookups this device has left today. Consumes nothing."""
    try:
        return await _get_usage(x_device_id)
    except ApiError as err:
        return err.response()


async def _get_usage(x_device_id: str | None) -> AiUsageResponse:
    limit = settings.ai_daily_limit_per_device
    if not settings.ai_enabled:
        return AiUsageResponse(
            enabled=False, limit=limit, remaining=0, resets_at=ai_limits.resets_at().isoformat()
        )
    usage = await _usage(_device_id(x_device_id))
    return AiUsageResponse(enabled=True, **usage.model_dump())


@router.post("", response_model=AiLookupResponse)
async def ai_lookup(
    body: AiLookupRequest,
    request: Request,
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
) -> Any:
    try:
        return await _lookup(body, request, x_device_id)
    except ApiError as err:
        return err.response()


async def _lookup(
    body: AiLookupRequest, request: Request, x_device_id: str | None
) -> AiLookupResponse:
    if not settings.ai_enabled:
        raise _error("AI_UNAVAILABLE", "The AI lookup is not available right now.", 503)
    device = _device_id(x_device_id)
    query = _clean_query(body.q)
    key = serpapi.cache_key(query, settings.ai_prompt_version)

    # 1. Cache: free for everyone, never counted.
    async with get_db_connection() as conn:
        hit = await ai_cache.get_cached(conn, key)
    if hit:
        return _response(
            query, hit["status"], hit["result"], True, await _usage(device), hit["created_at"]
        )

    ip = ai_limits.ip_key(_client_ip(request))
    lock = _locks.setdefault(key, asyncio.Lock())
    try:
        async with lock:
            # Someone else may have filled the cache while we waited for the lock.
            async with get_db_connection() as conn:
                hit = await ai_cache.get_cached(conn, key)
            if hit:
                return _response(
                    query,
                    hit["status"],
                    hit["result"],
                    True,
                    await _usage(device),
                    hit["created_at"],
                )

            # 2. Reserve a use in every scope; give them all back if any refuses.
            scopes = (
                ("device", device, settings.ai_daily_limit_per_device),
                ("ip", ip, settings.ai_daily_limit_per_ip),
                ("global", "all", settings.ai_daily_limit_global),
            )
            reserved: list[tuple[str, str]] = []
            async with get_db_connection() as conn:
                for scope, scope_key, limit in scopes:
                    if await ai_limits.reserve(conn, scope, scope_key, limit):
                        reserved.append((scope, scope_key))
                        continue
                    for s, k in reserved:
                        await ai_limits.refund(conn, s, k)
                    if scope == "global":
                        raise _error("AI_BUSY", "The AI lookup is busy. Try again tomorrow.", 503)
                    raise _error(
                        "AI_LIMIT_REACHED",
                        "You have used your lookups for today.",
                        429,
                        resets_at=ai_limits.resets_at().isoformat(),
                    )

            async def give_back() -> None:
                async with get_db_connection() as c:
                    for s, k in reserved:
                        await ai_limits.refund(c, s, k)

            # 3. The paid call. Failure or an empty answer costs the person nothing.
            try:
                raw = await serpapi.search(query)
            except serpapi.ProviderError:
                await give_back()
                raise _error(
                    "AI_UNAVAILABLE", "The AI lookup is not available right now.", 503
                ) from None

            result = serpapi.normalize_response(raw, query)
            outcome = result["result"]
            if outcome == "none":
                await give_back()
            ttl = settings.ai_cache_ttl_days if outcome == "ok" else settings.ai_none_ttl_days
            async with get_db_connection() as conn:
                await ai_cache.put_cached(
                    conn, key, query, outcome, result, ttl, settings.ai_prompt_version
                )
            return _response(
                query, outcome, result, False, await _usage(device), ai_limits.utc_now_iso()
            )
    finally:
        if not lock.locked():
            _locks.pop(key, None)
