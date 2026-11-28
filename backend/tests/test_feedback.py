"""Feedback endpoint: validation, honeypot, spam, limits, duplicates and privacy of the logs."""

import logging
import uuid
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.db import get_db_connection
from app.routers.feedback import _hash
from app.settings import settings

URL = "/api/v1/feedback"
TAG = "zz-test-fb"
UA = "zz-test-fb-agent"


def device() -> str:
    return str(uuid.uuid4())


def h(dev: str, ip: str | None = None) -> dict[str, str]:
    out = {"X-Device-Id": dev, "User-Agent": UA}
    if ip:
        out["X-Forwarded-For"] = ip
    return out


def msg(text: str = "") -> str:
    return f"{TAG} {text or uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture(autouse=True)
async def cleanup() -> Any:
    yield
    async with get_db_connection() as conn:
        await conn.execute("DELETE FROM feedback WHERE user_agent = %s", (UA,))


async def rows(dev: str) -> list[dict[str, Any]]:
    async with get_db_connection() as conn:
        cur = await conn.execute(
            "SELECT * FROM feedback WHERE device_hash = %s ORDER BY id", (_hash("device", dev),)
        )
        return list(await cur.fetchall())


async def send(client: AsyncClient, dev: str, kind: str = "idea", ip: str | None = None) -> int:
    res = await client.post(URL, json={"kind": kind, "message": msg()}, headers=h(dev, ip))
    return res.status_code


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind", ["bug", "wrong_data", "idea", "other", "helpful_yes", "helpful_no"]
)
async def test_each_kind_is_stored(client: AsyncClient, kind: str) -> None:
    dev = device()
    res = await client.post(URL, json={"kind": kind, "message": msg()}, headers=h(dev))
    assert res.status_code == 201 and res.json() == {"ok": True}
    stored = await rows(dev)
    assert len(stored) == 1 and stored[0]["kind"] == kind and stored[0]["status"] == "new"
    assert stored[0]["device_hash"] != dev and stored[0]["user_agent"] == UA


@pytest.mark.asyncio
async def test_context_contact_trimmed_and_whitespace_collapsed(client: AsyncClient) -> None:
    dev = device()
    body = {
        "kind": "bug",
        "message": f"  {TAG}\x00 a   b\n\nc\x07  ",
        "contact": "  me@example.com  ",
        "context": {
            "screen": "detail",
            "reg_number": "A4-2260",
            "query": "milo",
            "app_version": "1.2",
        },
    }
    assert (await client.post(URL, json=body, headers=h(dev))).status_code == 201
    r = (await rows(dev))[0]
    assert r["message"] == f"{TAG} a b c" and r["contact"] == "me@example.com"
    assert (r["screen"], r["reg_number"], r["query"], r["app_version"]) == (
        "detail",
        "A4-2260",
        "milo",
        "1.2",
    )


@pytest.mark.asyncio
async def test_message_required_for_bug_but_not_for_helpful(client: AsyncClient) -> None:
    dev = device()
    bad: list[dict[str, Any]] = [
        {"kind": "bug"},
        {"kind": "idea", "message": "  ab "},
        {"kind": "other", "message": None},
    ]
    for body in bad:
        res = await client.post(URL, json=body, headers=h(dev))
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "FEEDBACK_MESSAGE_REQUIRED"
    assert (await client.post(URL, json={"kind": "helpful_yes"}, headers=h(dev))).status_code == 201
    assert (await client.post(URL, json={"kind": "helpful_no"}, headers=h(dev))).status_code == 201
    stored = await rows(dev)
    assert [r["kind"] for r in stored] == ["helpful_yes", "helpful_no"]
    assert stored[0]["message"] is None


@pytest.mark.asyncio
async def test_honeypot_returns_201_and_stores_nothing(client: AsyncClient) -> None:
    dev = device()
    res = await client.post(
        URL, json={"kind": "bug", "message": msg(), "website": "http://spam.test"}, headers=h(dev)
    )
    assert res.status_code == 201 and res.json() == {"ok": True}
    assert await rows(dev) == []


@pytest.mark.asyncio
async def test_too_many_links_rejected(client: AsyncClient) -> None:
    dev = device()
    four = " ".join(f"http://a{i}.test" for i in range(4))
    res = await client.post(URL, json={"kind": "other", "message": f"{TAG} {four}"}, headers=h(dev))
    assert res.status_code == 400 and res.json()["error"]["code"] == "FEEDBACK_REJECTED"
    three = " ".join(f"https://a{i}.test" for i in range(3))
    ok = await client.post(URL, json={"kind": "other", "message": f"{TAG} {three}"}, headers=h(dev))
    assert ok.status_code == 201
    assert len(await rows(dev)) == 1


@pytest.mark.asyncio
async def test_length_limits(client: AsyncClient) -> None:
    dev = device()
    base = {"kind": "bug", "message": msg()}
    cases: list[dict[str, Any]] = [
        {"message": "x" * 1001},
        {"contact": "x" * 121},
        {"context": {"screen": "x" * 41}},
        {"context": {"reg_number": "x" * 41}},
        {"context": {"query": "x" * 121}},
        {"context": {"app_version": "x" * 21}},
        {"kind": "nonsense"},
    ]
    for extra in cases:
        res = await client.post(URL, json={**base, **extra}, headers=h(dev))
        assert res.status_code == 400 and res.json()["error"]["code"] == "FEEDBACK_INVALID", extra
    exact = {"kind": "bug", "message": "x" * 1000, "contact": "y" * 120}
    assert (await client.post(URL, json=exact, headers=h(dev))).status_code == 201
    assert len(await rows(dev)) == 1


@pytest.mark.asyncio
async def test_invalid_device_id_rejected(client: AsyncClient) -> None:
    body = {"kind": "helpful_yes"}
    for headers in ({}, {"X-Device-Id": "not-a-uuid"}):
        res = await client.post(URL, json=body, headers={**headers, "User-Agent": UA})
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "FEEDBACK_DEVICE_REQUIRED"


@pytest.mark.asyncio
async def test_device_hourly_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "feedback_limit_per_device_hour", 2)
    dev = device()
    codes = [await send(client, dev) for _ in range(3)]
    assert codes == [201, 201, 429]
    res = await client.post(URL, json={"kind": "idea", "message": msg()}, headers=h(dev))
    assert res.json()["error"]["code"] == "FEEDBACK_RATE_LIMITED"
    assert len(await rows(dev)) == 2


@pytest.mark.asyncio
async def test_device_daily_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "feedback_limit_per_device_day", 2)
    dev = device()
    assert [await send(client, dev) for _ in range(3)] == [201, 201, 429]


@pytest.mark.asyncio
async def test_ip_daily_limit_across_devices(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "feedback_limit_per_ip_day", 2)
    ip = "203.0.113.77"
    assert [await send(client, device(), ip=ip) for _ in range(3)] == [201, 201, 429]


@pytest.mark.asyncio
async def test_exact_duplicate_within_ten_minutes_is_stored_once(client: AsyncClient) -> None:
    dev = device()
    body = {"kind": "bug", "message": msg()}
    first = await client.post(URL, json=body, headers=h(dev))
    second = await client.post(URL, json=body, headers=h(dev))
    assert first.status_code == second.status_code == 201 and second.json() == {"ok": True}
    assert len(await rows(dev)) == 1
    # A different kind or a different device is not a duplicate.
    await client.post(URL, json={**body, "kind": "idea"}, headers=h(dev))
    await client.post(URL, json=body, headers=h(device()))
    assert len(await rows(dev)) == 2


@pytest.mark.asyncio
async def test_raw_device_ip_and_contact_never_logged_or_stored_raw(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    dev = device()
    ip = "198.51.100.23"
    contact = "private.person@example.com"
    caplog.set_level(logging.DEBUG)
    res = await client.post(
        URL,
        json={"kind": "bug", "message": msg("secretwords"), "contact": contact},
        headers=h(dev, ip),
    )
    assert res.status_code == 201
    assert contact not in res.text and "secretwords" not in res.text
    for secret in (dev, ip, contact, "secretwords"):
        assert secret not in caplog.text
    r = (await rows(dev))[0]
    assert dev != r["device_hash"] and ip not in r["ip_hash"]
