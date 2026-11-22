import pytest
from checkam_etl.image_match import load_match_config
from checkam_etl.imagesearch.base import Candidate, ProviderError, ProviderThrottled
from checkam_etl.imagesearch.ddgs_provider import parse_results
from checkam_etl.sources.image_enrich import (
    CircuitBreaker,
    Outcome,
    Pacing,
    ProductToEnrich,
    RateLimiter,
    ingest_image_enrich,
    process_product,
    write_csv,
)

CFG = load_match_config()
FAST = Pacing(min_delay=0, jitter=0, retries=1, retry_backoff=0, pause_seconds=0, max_pauses=1,
              throttle_threshold=2)
PRODUCT = ProductToEnrich("11111111-1111-1111-1111-111111111111", "Strepsil Intensive Lozenges",
                          "Reckitt Benckiser Nigeria Limited", "OTC")
GOOD = Candidate(
    image_url="https://megacare.ng/shop/strepsils-intensive.jpg",
    page_url="https://megacare.ng/shop/strepsils-intensive-reckitt-benckiser",
    title="Strepsils Intensive Lozenges X16 Reckitt Benckiser",
    width=1200, height=1200,
)


class FakeProvider:
    def __init__(self, script: list[object]) -> None:
        self.script = list(script)
        self.calls = 0

    async def search(self, query: str, max_results: int = 8) -> list[Candidate]:
        self.calls += 1
        item = self.script.pop(0) if self.script else []
        if isinstance(item, Exception):
            raise item
        return item  # type: ignore[return-value]


async def _valid(url: str) -> bool:
    return True


async def _invalid(url: str) -> bool:
    return False


def tools() -> tuple[RateLimiter, CircuitBreaker]:
    return RateLimiter(0, 0), CircuitBreaker(FAST.throttle_threshold, 0, FAST.max_pauses)


@pytest.mark.asyncio
async def test_matched_when_scored_and_validated() -> None:
    lim, br = tools()
    out = await process_product(PRODUCT, FakeProvider([[GOOD]]), _valid, CFG, lim, br, FAST)
    assert out.status == "matched"
    assert out.image_url == GOOD.image_url
    assert out.page_url == GOOD.page_url
    assert out.score
    assert out.score >= CFG.threshold


@pytest.mark.asyncio
async def test_invalid_url_means_no_match() -> None:
    lim, br = tools()
    prov = FakeProvider([[GOOD], [GOOD]])
    out = await process_product(PRODUCT, prov, _invalid, CFG, lim, br, FAST)
    assert out.status == "no_match"
    assert out.image_url is None
    assert out.invalid_urls == 2


@pytest.mark.asyncio
async def test_low_score_results_store_nothing() -> None:
    junk = Candidate("https://x.example.com/a.jpg", "https://x.example.com/p", "Unrelated page",
                     800, 800)
    lim, br = tools()
    out = await process_product(PRODUCT, FakeProvider([[junk], [junk]]), _valid, CFG, lim, br, FAST)
    assert out.status == "no_match"
    assert out.image_url is None


@pytest.mark.asyncio
async def test_second_query_used_only_when_first_fails() -> None:
    prov = FakeProvider([[], [GOOD]])
    lim, br = tools()
    out = await process_product(PRODUCT, prov, _valid, CFG, lim, br, FAST)
    assert out.status == "matched"
    assert prov.calls == 2
    prov2 = FakeProvider([[GOOD]])
    out2 = await process_product(PRODUCT, prov2, _valid, CFG, *tools(), FAST)
    assert out2.status == "matched"
    assert prov2.calls == 1


@pytest.mark.asyncio
async def test_provider_errors_are_not_a_no_match() -> None:
    prov = FakeProvider([ProviderError("boom")] * 10)
    lim, br = tools()
    out = await process_product(PRODUCT, prov, _valid, CFG, lim, br, FAST)
    assert out.status == "provider_error"  # must be retried later, not marked checked


@pytest.mark.asyncio
async def test_circuit_breaker_stops_run() -> None:
    prov = FakeProvider([ProviderThrottled("429")] * 50)
    lim, br = tools()
    out = await process_product(PRODUCT, prov, _valid, CFG, lim, br, FAST)
    assert br.open
    assert out.status == "stopped"
    assert br.throttle_events >= 2


@pytest.mark.asyncio
async def test_dry_run_writes_nothing_and_reports() -> None:
    rep = await ingest_image_enrich(
        dry_run=True, provider=FakeProvider([[GOOD]]), validate=_valid, products=[PRODUCT],
        pacing=FAST, workers=1, cfg=CFG,
    )
    assert rep.matched == 1
    assert rep.images_set == 0
    assert rep.parsed == 1
    assert not rep.errors


@pytest.mark.asyncio
async def test_breaker_open_reports_error() -> None:
    rep = await ingest_image_enrich(
        dry_run=True, provider=FakeProvider([ProviderThrottled("429")] * 50), validate=_valid,
        products=[PRODUCT], pacing=FAST, workers=1, cfg=CFG,
    )
    assert rep.throttled >= 2
    assert any("circuit breaker" in e for e in rep.errors)


def test_parse_results_maps_ddgs_rows() -> None:
    rows = [
        {"title": "T", "image": "https://a/b.jpg", "url": "https://a/p",
         "width": "640", "height": 480},
        {"title": "no image", "image": "", "url": "https://a/q"},
    ]
    parsed = parse_results(rows)
    assert len(parsed) == 1
    assert parsed[0].width == 640
    assert parsed[0].source_domain == "a"
    assert parse_results(None) == []


def test_write_csv_has_label_column(tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = tmp_path / "sample.csv"
    write_csv(path, [Outcome(PRODUCT, "matched", GOOD.image_url, GOOD.page_url, 0.9)])
    header, row = path.read_text(encoding="utf-8").splitlines()[:2]
    assert header.endswith("label")
    assert GOOD.image_url in row


@pytest.mark.asyncio
async def test_search_cache_skips_provider_and_pacing(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from checkam_etl.imagesearch.cache import CachedProvider

    inner = FakeProvider([[GOOD]])
    cached = CachedProvider(inner, tmp_path)
    lim, br = tools()
    first = await process_product(PRODUCT, cached, _valid, CFG, lim, br, FAST)
    second = await process_product(PRODUCT, cached, _valid, CFG, lim, br, FAST)
    assert first.status == second.status == "matched"
    assert inner.calls == 1  # the second product run was served from disk
    assert cached.hits >= 1


@pytest.mark.asyncio
async def test_errors_are_never_cached(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from checkam_etl.imagesearch.cache import CachedProvider

    cached = CachedProvider(FakeProvider([ProviderError("boom")]), tmp_path)
    with pytest.raises(ProviderError):
        await cached.search("anything")
    assert cached.peek("anything") is None


@pytest.mark.asyncio
async def test_rate_limiter_slows_on_throttle_and_recovers() -> None:
    lim = RateLimiter(0.5, 0, max_delay=4.0)
    lim.slow_down()
    lim.slow_down()
    assert lim.interval == 2.0
    for _ in range(40):
        lim.speed_up()
    assert lim.interval == 0.5  # back at the floor
    for _ in range(10):
        lim.slow_down()
    assert lim.interval == 4.0  # capped


@pytest.mark.asyncio
async def test_candidates_validated_in_parallel_best_ranked_valid_wins() -> None:
    import asyncio

    second = Candidate(
        image_url="https://megacare.ng/shop/strepsils-2.jpg",
        page_url="https://megacare.ng/shop/strepsils-intensive-reckitt-benckiser-2",
        title="Strepsil Intensive Lozenges Reckitt Benckiser",
        width=900, height=900,
    )
    active = 0
    peak = 0

    async def slow_validate(url: str) -> bool:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.05)
        active -= 1
        return url != GOOD.image_url  # the best-ranked link is dead

    lim, br = tools()
    out = await process_product(
        PRODUCT, FakeProvider([[GOOD, second]]), slow_validate, CFG, lim, br, FAST
    )
    assert out.status == "matched"
    assert out.image_url == second.image_url
    assert out.invalid_urls == 1
    assert peak == 2  # both links were checked at the same time


@pytest.mark.asyncio
async def test_many_workers_process_every_product_once() -> None:
    products = [
        ProductToEnrich(f"{i:08d}-1111-1111-1111-111111111111", f"Strepsil Intensive Lozenges {i}",
                        "Reckitt Benckiser Nigeria Limited", "OTC")
        for i in range(30)
    ]

    class Always:
        calls = 0

        async def search(self, query: str, max_results: int = 8) -> list[Candidate]:
            Always.calls += 1
            return [GOOD]

    rep = await ingest_image_enrich(
        dry_run=True, provider=Always(), validate=_valid, products=products,
        pacing=FAST, workers=8, cfg=CFG,
    )
    assert rep.fetched == 30
    assert rep.parsed == 30
    assert Always.calls == 30  # one search each, no repeats or drops
