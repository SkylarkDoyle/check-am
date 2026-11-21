import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_checklists(client: AsyncClient) -> None:
    res = await client.get("/checklists")
    assert res.status_code == 200
    checklists = res.json()
    assert len(checklists) >= 14  # 5 category defaults + 9 variants
    variants = {c["variant"] for c in checklists}
    assert "" in variants  # category default variant is empty string
    assert "sachet" in variants
    assert "tablet" in variants


@pytest.mark.asyncio
async def test_resolve_checklist_variant_and_tokens(client: AsyncClient) -> None:
    res = await client.get("/checklists/resolve?category=Food&pack_type=sachet&reg_number=01-4721")
    assert res.status_code == 200
    points = res.json()
    assert len(points) >= 3

    # Ensure token substitution happened
    reg_point = next((p for p in points if p["key"] == "reg_number"), None)
    assert reg_point is not None
    assert "01-4721" in reg_point["detail"]
    assert "{reg_number}" not in reg_point["detail"]


@pytest.mark.asyncio
async def test_resolve_checklist_fallback_to_default(client: AsyncClient) -> None:
    # If an unknown pack_type is provided, fallback to category default
    res = await client.get("/checklists/resolve?category=Food&pack_type=unknown_box")
    assert res.status_code == 200
    points = res.json()
    assert len(points) >= 3
