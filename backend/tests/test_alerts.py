from uuid import UUID

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_alerts(client: AsyncClient) -> None:
    res = await client.get("/alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert len(alerts) >= 1
    first = alerts[0]
    assert "id" in first
    assert "alert_reference_no" in first
    assert "product_name" in first
    assert "summary" in first
    assert "issued_date" in first

    # Ensure no elementor boilerplate in any summary
    for alert in alerts:
        summary_lower = alert["summary"].lower()
        assert "elementor" not in summary_lower
        assert "leave a comment" not in summary_lower


@pytest.mark.asyncio
async def test_get_alert_by_id(client: AsyncClient) -> None:
    res = await client.get("/alerts?limit=1")
    assert res.status_code == 200
    alert_id = res.json()[0]["id"]

    res_single = await client.get(f"/alerts/{alert_id}")
    assert res_single.status_code == 200
    alert = res_single.json()
    assert alert["id"] == alert_id


@pytest.mark.asyncio
async def test_get_alert_not_found(client: AsyncClient) -> None:
    fake_id = UUID("00000000-0000-0000-0000-000000000000")
    res = await client.get(f"/alerts/{fake_id}")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
