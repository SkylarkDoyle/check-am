"""AI lookup: normalisation, cache, limits, refunds, errors. The provider is always faked."""

import asyncio
import json
import uuid
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.db import get_db_connection
from app.services import ai_limits, serpapi
from app.settings import settings

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "serpapi_google_ai_mode.json").read_text(encoding="utf-8")
)
URL = "/api/v1/ai-lookup"


def device() -> str:
    return str(uuid.uuid4())


def unique_query(prefix: str = "zz-test") -> str:
    return f"{prefix} {uuid.uuid4().hex[:10]}"


# ---------------------------------------------------------------- pure functions (no database)
def test_build_query_is_nigeria_and_nafdac_focused() -> None:
    q = serpapi.build_query("Colgate toothpaste")
    assert "Nigeria" in q and "NAFDAC" in q and "Colgate toothpaste" in q
    reg = serpapi.build_query("A4-2260")
    assert "NAFDAC registration number A4-2260" in reg


def test_cache_key_ignores_case_and_punctuation() -> None:
    assert serpapi.cache_key("Colgate  Toothpaste!", 1) == serpapi.cache_key(
        "colgate toothpaste", 1
    )
    assert serpapi.cache_key("a4-2260", 1) == serpapi.cache_key("A4 2260", 1) == "v1:reg:A42260"
    assert serpapi.cache_key("colgate toothpaste", 1) != serpapi.cache_key("colgate toothpaste", 2)


def test_normalize_keeps_useful_blocks_and_drops_misleading_ones() -> None:
    out = serpapi.normalize_response(FIXTURE, "Colgate toothpaste")
    assert out["result"] == "ok"
    texts = json.dumps(out["blocks"])
    assert "1-800-468-6502" not in texts, "foreign phone numbers must be dropped"
    assert "tell me what size" not in texts, "the chatty closing line must be dropped"
    assert "UPC Barcode" in texts and "Poor Packaging Quality" in texts
    kinds = [b["type"] for b in out["blocks"]]
    assert kinds[0] == "paragraph" and "heading" in kinds and "list" in kinds


def test_normalize_keeps_nested_list_items() -> None:
    out = serpapi.normalize_response(FIXTURE, "Colgate toothpaste")
    nested = [
        item
        for b in out["blocks"]
        if b["type"] == "list"
        for item in b["items"]
        if item.get("items")
    ]
    assert nested and nested[0]["items"][0]["text"].startswith('"isclinically"')


def test_normalize_only_keeps_https_sources() -> None:
    out = serpapi.normalize_response(FIXTURE, "Colgate toothpaste")
    assert [s["url"] for s in out["sources"]] == [
        "https://www.colgatepalmolive.com/en-us/identifying-counterfeit-products"
    ]
    assert out["sources"][0]["icon"].startswith("https://")


def test_normalize_drops_social_media_sources() -> None:
    raw = {
        "text_blocks": [{"type": "paragraph", "snippet": "y" * 260}],
        "references": [
            {
                "title": "Post",
                "link": "https://www.facebook.com/page/posts/1",
                "source": "Facebook",
            },
            {"title": "Alert", "link": "https://nafdac.gov.ng/alert", "source": "NAFDAC"},
        ],
    }
    out = serpapi.normalize_response(raw, "x")
    assert [s["source"] for s in out["sources"]] == ["NAFDAC"]


def test_normalize_strips_html_and_returns_none_when_empty() -> None:
    raw = {"text_blocks": [{"type": "paragraph", "snippet": "<b>Short</b>"}], "references": []}
    assert serpapi.normalize_response(raw, "x")["result"] == "none"  # too little to be useful
    assert serpapi.normalize_response({}, "x") == {
        "query": "x",
        "result": "none",
        "blocks": [],
        "sources": [],
    }


def test_normalize_drops_headings_with_no_content() -> None:
    raw = {
        "text_blocks": [
            {"type": "heading", "snippet": "Lonely heading"},
            {"type": "heading", "snippet": "Real heading"},
            {"type": "list", "list": [{"snippet": "x" * 260}]},
            {"type": "heading", "snippet": "Trailing heading"},
        ],
        "references": [],
    }
    out = serpapi.normalize_response(raw, "x")
    assert [b["text"] for b in out["blocks"] if b["type"] == "heading"] == ["Real heading"]


# ---------------------------------------------------------- endpoint tests (real DB, fake provider)
class FakeProvider:
    def __init__(self) -> None:
        self.calls = 0
        self.raw: dict[str, Any] = FIXTURE
        self.fail = False
        self.delay = 0.0

    async def __call__(self, query: str, client: Any = None) -> dict[str, Any]:
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise serpapi.ProviderError("provider returned HTTP 500")
        return self.raw


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> FakeProvider:
    fake = FakeProvider()
    monkeypatch.setattr(serpapi, "search", fake)
    monkeypatch.setattr(settings, "serpapi_api_key", "test-key")
    monkeypatch.setattr(settings, "ai_lookup_enabled", True)
    monkeypatch.setattr(settings, "ai_daily_limit_per_device", 5)
    monkeypatch.setattr(settings, "ai_daily_limit_per_ip", 1000)
    monkeypatch.setattr(settings, "ai_daily_limit_global", 100000)
    return fake


@pytest_asyncio.fixture(autouse=True)
async def cleanup() -> Any:
    yield
    async with get_db_connection() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM ai_lookups WHERE query_text LIKE 'zz-test%'")
            await conn.execute(
                "DELETE FROM ai_usage WHERE scope = 'device' AND day = %s", (ai_limits.today(),)
            )
            await conn.execute(
                "DELETE FROM ai_usage WHERE scope IN ('ip', 'global') AND day = %s",
                (ai_limits.today(),),
            )


def headers(dev: str) -> dict[str, str]:
    return {"X-Device-Id": dev}


@pytest.mark.asyncio
async def test_first_lookup_returns_answer_and_counts_one(
    client: AsyncClient, provider: FakeProvider
) -> None:
    dev = device()
    res = await client.post(URL, json={"q": unique_query()}, headers=headers(dev))
    assert res.status_code == 200
    body = res.json()
    assert body["result"] == "ok" and body["cached"] is False
    assert body["usage"] == {**body["usage"], "limit": 5, "remaining": 4}
    assert body["disclaimer"] == "AI responses may include mistakes."
    assert provider.calls == 1


@pytest.mark.asyncio
async def test_same_question_is_served_from_cache_and_is_free(
    client: AsyncClient, provider: FakeProvider
) -> None:
    q = unique_query()
    dev = device()
    first = await client.post(URL, json={"q": q}, headers=headers(dev))
    second = await client.post(
        URL, json={"q": q.upper() + "!"}, headers=headers(dev)
    )  # same question, new casing
    other_device = await client.post(URL, json={"q": q}, headers=headers(device()))
    assert provider.calls == 1, "the provider must be asked once for the same question"
    assert second.json()["cached"] is True and other_device.json()["cached"] is True
    assert second.json()["usage"]["remaining"] == first.json()["usage"]["remaining"] == 4
    assert other_device.json()["usage"]["remaining"] == 5, "a cache hit costs the asker nothing"


@pytest.mark.asyncio
async def test_five_per_device_per_day_then_429_with_reset_time(
    client: AsyncClient, provider: FakeProvider
) -> None:
    dev = device()
    for _ in range(5):
        ok = await client.post(URL, json={"q": unique_query()}, headers=headers(dev))
        assert ok.status_code == 200
    blocked = await client.post(URL, json={"q": unique_query()}, headers=headers(dev))
    assert blocked.status_code == 429
    err = blocked.json()["error"]
    assert err["code"] == "AI_LIMIT_REACHED" and err["resets_at"]
    assert provider.calls == 5, "no provider call once the limit is reached"
    # A cached answer is still free after the limit is hit.
    again = await client.post(URL, json={"q": unique_query()}, headers=headers(device()))
    assert again.status_code == 200


@pytest.mark.asyncio
async def test_nothing_found_is_not_counted_and_is_cached(
    client: AsyncClient, provider: FakeProvider
) -> None:
    provider.raw = {"text_blocks": [], "references": []}
    q = unique_query()
    dev = device()
    res = await client.post(URL, json={"q": q}, headers=headers(dev))
    assert res.json()["result"] == "none" and res.json()["usage"]["remaining"] == 5
    again = await client.post(URL, json={"q": q}, headers=headers(dev))
    assert again.json()["cached"] is True and provider.calls == 1


@pytest.mark.asyncio
async def test_provider_failure_is_503_and_refunded(
    client: AsyncClient, provider: FakeProvider
) -> None:
    provider.fail = True
    dev = device()
    res = await client.post(URL, json={"q": unique_query()}, headers=headers(dev))
    assert res.status_code == 503 and res.json()["error"]["code"] == "AI_UNAVAILABLE"
    usage = await client.get(f"{URL}/usage", headers=headers(dev))
    assert usage.json()["remaining"] == 5, "a failed lookup must not use up the allowance"
    assert "test-key" not in res.text


@pytest.mark.asyncio
async def test_two_simultaneous_identical_questions_make_one_provider_call(
    client: AsyncClient, provider: FakeProvider
) -> None:
    provider.delay = 0.3
    q = unique_query()
    a, b = await asyncio.gather(
        client.post(URL, json={"q": q}, headers=headers(device())),
        client.post(URL, json={"q": q}, headers=headers(device())),
    )
    assert a.status_code == b.status_code == 200
    assert provider.calls == 1
    assert sorted([a.json()["cached"], b.json()["cached"]]) == [False, True]


@pytest.mark.asyncio
async def test_global_cap_stops_the_call_and_gives_the_device_use_back(
    client: AsyncClient, provider: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ai_daily_limit_global", 0)
    dev = device()
    res = await client.post(URL, json={"q": unique_query()}, headers=headers(dev))
    assert res.status_code == 503 and res.json()["error"]["code"] == "AI_BUSY"
    assert provider.calls == 0
    monkeypatch.setattr(settings, "ai_daily_limit_global", 100000)
    usage = await client.get(f"{URL}/usage", headers=headers(dev))
    assert usage.json()["remaining"] == 5


@pytest.mark.asyncio
async def test_ip_backstop_limits_everyone_behind_one_address(
    client: AsyncClient, provider: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ai_daily_limit_per_ip", 2)
    h = {"X-Forwarded-For": "203.0.113.9"}
    codes = []
    for _ in range(3):
        r = await client.post(URL, json={"q": unique_query()}, headers={**h, **headers(device())})
        codes.append(r.status_code)
    assert codes == [200, 200, 429]


@pytest.mark.asyncio
async def test_bad_input_and_missing_device_are_rejected_without_a_provider_call(
    client: AsyncClient, provider: FakeProvider
) -> None:
    dev = device()
    assert (await client.post(URL, json={"q": "ab"}, headers=headers(dev))).status_code == 422
    assert (await client.post(URL, json={"q": "x" * 81}, headers=headers(dev))).status_code == 422
    assert (await client.post(URL, json={"q": "!!!???"}, headers=headers(dev))).status_code == 422
    assert (
        await client.post(URL, json={"q": "bad\x00query"}, headers=headers(dev))
    ).status_code == 422
    assert (await client.post(URL, json={"q": "Colgate toothpaste"})).status_code == 422
    assert (
        await client.post(URL, json={"q": "Colgate toothpaste"}, headers=headers("not-a-uuid"))
    ).status_code == 422
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_disabled_without_a_key(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "serpapi_api_key", None)
    res = await client.post(URL, json={"q": "Colgate toothpaste"}, headers=headers(device()))
    assert res.status_code == 503
    usage = await client.get(f"{URL}/usage", headers=headers(device()))
    assert usage.json()["enabled"] is False
    meta = await client.get("/api/v1/meta")
    assert meta.json()["ai_lookup_enabled"] is False


@pytest.mark.asyncio
async def test_meta_and_usage_report_enabled(client: AsyncClient, provider: FakeProvider) -> None:
    assert (await client.get("/api/v1/meta")).json()["ai_lookup_enabled"] is True
    usage = (await client.get(f"{URL}/usage", headers=headers(device()))).json()
    assert usage["enabled"] is True and usage["limit"] == 5 and usage["remaining"] == 5
