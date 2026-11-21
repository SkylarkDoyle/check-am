import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_products_feed(client: AsyncClient) -> None:
    res = await client.get("/products?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert len(data["items"]) == 10
    assert data["has_more"] is True
    assert data["next_cursor"] is not None

    first = data["items"][0]
    assert "id" in first
    assert "name" in first
    assert "reg_number" in first
    assert "category" in first
    assert "manufacturer" in first
    assert "status" in first


@pytest.mark.asyncio
async def test_products_feed_cursor_pagination(client: AsyncClient) -> None:
    res1 = await client.get("/products?limit=5")
    assert res1.status_code == 200
    data1 = res1.json()
    cursor = data1["next_cursor"]
    assert cursor is not None

    res2 = await client.get(f"/products?limit=5&cursor={cursor}")
    assert res2.status_code == 200
    data2 = res2.json()

    # The items on page 2 should not overlap with page 1
    ids1 = {p["id"] for p in data1["items"]}
    ids2 = {p["id"] for p in data2["items"]}
    assert len(ids1.intersection(ids2)) == 0


@pytest.mark.asyncio
async def test_products_feed_category_filter(client: AsyncClient) -> None:
    res = await client.get("/products?category=Drinks&limit=5")
    assert res.status_code == 200
    data = res.json()
    for item in data["items"]:
        assert item["category"] == "Drinks"


@pytest.mark.asyncio
async def test_product_detail_found(client: AsyncClient) -> None:
    # First get a product ID from feed
    res_feed = await client.get("/products?limit=1")
    assert res_feed.status_code == 200
    prod_id = res_feed.json()["items"][0]["id"]

    res = await client.get(f"/products/{prod_id}")
    assert res.status_code == 200
    detail = res.json()
    assert detail["id"] == prod_id
    assert "name" in detail
    assert "reg_number" in detail
    assert "alerts" in detail
    assert isinstance(detail["alerts"], list)
    assert "checklist" in detail
    assert isinstance(detail["checklist"], list)


@pytest.mark.asyncio
async def test_product_detail_not_found(client: AsyncClient) -> None:
    res = await client.get("/products/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404
    err = res.json()
    assert err["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_product_lookup_exact_and_normalized(client: AsyncClient) -> None:
    # Lookup by real product from DB (FoodDB item)
    res_feed = await client.get("/products?limit=1")
    sample = res_feed.json()["items"][0]
    reg_dashed = sample["reg_number"]
    reg_clean = sample["reg_normalized"]

    # Dashed lookup
    res1 = await client.get(f"/products/lookup?reg={reg_dashed}")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["result"] in ("match", "multiple")
    assert len(data1["products"]) >= 1

    # Stripped/normalized lookup
    res2 = await client.get(f"/products/lookup?reg={reg_clean}")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["result"] in ("match", "multiple")
    assert len(data2["products"]) >= 1


@pytest.mark.asyncio
async def test_product_lookup_not_found(client: AsyncClient) -> None:
    res = await client.get("/products/lookup?reg=ZZ-999999")
    assert res.status_code == 200
    data = res.json()
    assert data["result"] == "not_found"
    assert data["products"] == []
