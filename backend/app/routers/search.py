import re

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.cache import get_cache
from app.db import get_db_connection
from app.queries import search_products
from app.schemas import SearchResponse, UiCategory

router = APIRouter(tags=["search"])

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


@router.get("/search", response_model=SearchResponse)
async def search(
    request: Request,
    q: str = Query(..., min_length=2, max_length=80),
    category: UiCategory | None = None,
    limit: int = Query(default=20, ge=1, le=50),
) -> SearchResponse:
    # 1. Rate limiting
    cache = get_cache()
    client_ip = request.client.host if request.client else "127.0.0.1"
    allowed = await cache.check_rate_limit(f"rl:{client_ip}:search", limit=60, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": "Too many requests. Please slow down.",
                }
            },
        )

    # 2. Input validation & sanitization
    if _CONTROL_CHARS_RE.search(q):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_QUERY",
                    "message": "Query contains invalid characters",
                }
            },
        )

    cleaned_q = re.sub(r"\s+", " ", q).strip()
    if len(cleaned_q) < 2:
        return SearchResponse(items=[], total=0)

    # 3. Check cache
    cache_key = f"search:{cleaned_q.lower()}:{category}:{limit}"
    cached_val = await cache.get(cache_key)
    if cached_val is not None:
        return SearchResponse.model_validate(cached_val)

    # 4. Database query
    async with get_db_connection() as conn:
        items = await search_products(conn, query=cleaned_q, category=category, limit=limit)

    resp = SearchResponse(items=items, total=len(items))
    await cache.set(cache_key, resp.model_dump(), ttl_seconds=60)
    return resp
