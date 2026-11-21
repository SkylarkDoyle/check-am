from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.db import get_db_connection
from app.queries import get_product_by_id, get_products_feed, lookup_by_reg
from app.schemas import (
    LookupResponse,
    ProductDetail,
    ProductsFeedResponse,
    UiCategory,
)

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductsFeedResponse)
async def list_products(
    category: UiCategory | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    cursor: str | None = None,
) -> ProductsFeedResponse:
    async with get_db_connection() as conn:
        items, next_cursor, has_more = await get_products_feed(
            conn, category=category, limit=limit, cursor=cursor
        )
    return ProductsFeedResponse(items=items, next_cursor=next_cursor, has_more=has_more)


@router.get("/lookup", response_model=LookupResponse)
async def lookup_product_by_reg(
    reg: str = Query(..., min_length=2, max_length=50),
) -> LookupResponse:
    async with get_db_connection() as conn:
        products = await lookup_by_reg(conn, raw_reg=reg)

    if not products:
        return LookupResponse(result="not_found", products=[])
    if len(products) > 1:
        return LookupResponse(result="multiple", products=products)
    return LookupResponse(result="match", products=products)


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product_detail(
    product_id: UUID,
) -> ProductDetail:
    async with get_db_connection() as conn:
        product = await get_product_by_id(conn, product_id)

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": f"Product {product_id} not found"}},
        )
    return product
