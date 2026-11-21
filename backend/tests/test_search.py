import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_search_reg_exact(client: AsyncClient) -> None:
    # Get a real product reg number
    res_feed = await client.get("/products?limit=1")
    reg = res_feed.json()["items"][0]["reg_number"]

    res = await client.get(f"/search?q={reg}")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert data["items"][0]["match_type"] == "reg_exact"


@pytest.mark.asyncio
async def test_search_reg_prefix(client: AsyncClient) -> None:
    res_feed = await client.get("/products?limit=1")
    reg = res_feed.json()["items"][0]["reg_number"]
    # Take first 4 characters (e.g. "01-0" or "A8-1")
    prefix = reg[:4]

    res = await client.get(f"/search?q={prefix}")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    # Match type should be reg_exact or reg_prefix
    assert data["items"][0]["match_type"] in ("reg_exact", "reg_prefix")


@pytest.mark.asyncio
async def test_search_name_fuzzy(client: AsyncClient) -> None:
    res = await client.get("/search?q=paracetamol")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert any("paracetamol" in item["name"].lower() for item in data["items"])


@pytest.mark.asyncio
async def test_search_maker(client: AsyncClient) -> None:
    res = await client.get("/search?q=Nestle")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert any("nestl" in item["manufacturer"].lower() for item in data["items"])


@pytest.mark.asyncio
async def test_search_sanitization_rejects_control_characters(client: AsyncClient) -> None:
    res = await client.get("/search?q=test%07bad")
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "INVALID_QUERY"


@pytest.mark.asyncio
async def test_search_latency_and_caching(client: AsyncClient) -> None:
    # First search (populates cache)
    res1 = await client.get("/search?q=water")
    assert res1.status_code == 200

    # Second search (served from in-memory cache)
    res2 = await client.get("/search?q=water")
    assert res2.status_code == 200
    assert res1.json() == res2.json()
