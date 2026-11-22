"""Find a product photo URL for products that have none, and store only the link.

Precision first: an image is stored only when its score clears the threshold AND the URL
passes validation (https, image type, size cap, SSRF guard). Otherwise the column stays
NULL and the app shows its SVG fallback. The provider is blocked, throttled or empty? We
back off and stop; we never try to bypass a block.

Throughput: many products are worked on at once. Searches start at a shared, adaptive rate
(faster while the provider is happy, slower when it throttles), candidate links are
validated in parallel over one shared HTTP client, search results are cached on disk, and
database writes are batched.
"""

import asyncio
import csv
import random
import time
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

import httpx
import psycopg
from checkam_etl.db import get_db_connection
from checkam_etl.image_match import (
    MatchConfig,
    build_queries,
    load_match_config,
    rank_candidates,
    score_candidate,
)
from checkam_etl.images import validate_image_url
from checkam_etl.imagesearch import get_provider
from checkam_etl.imagesearch.base import (
    Candidate,
    ImageSearchProvider,
    ProviderError,
    ProviderThrottled,
)
from checkam_etl.imagesearch.cache import CachedProvider
from checkam_etl.run_report import RunReport
from checkam_etl.settings import settings

ValidateFn = Callable[[str], Awaitable[bool]]
RECHECK_DAYS = 90
FLUSH_EVERY = 25
PROGRESS_EVERY = 50


@dataclass(frozen=True)
class ProductToEnrich:
    id: str
    name: str
    manufacturer: str
    category: str


@dataclass
class Outcome:
    product: ProductToEnrich
    status: str  # matched | no_match | provider_error | stopped
    image_url: str | None = None
    page_url: str | None = None
    score: float | None = None
    invalid_urls: int = 0
    rejected_low_score: int = 0
    queries: int = 0
    note: str = ""


@dataclass
class Pacing:
    min_delay: float = 0.7  # seconds between search starts (shared by all workers)
    jitter: float = 0.2
    retries: int = 2
    retry_backoff: float = 3.0
    throttle_threshold: int = 5
    pause_seconds: float = 300.0
    max_pauses: int = 3


class RateLimiter:
    """Search starts are spaced `interval` seconds apart across ALL workers.

    Adaptive: a throttling reply doubles the interval (up to max_delay); each success
    shrinks it back toward the configured floor.
    """

    def __init__(self, min_delay: float, jitter: float, max_delay: float = 10.0) -> None:
        self.floor = min_delay
        self.interval = min_delay
        self.jitter = jitter
        self.max_delay = max_delay
        self._next_at = 0.0
        self._lock = asyncio.Lock()

    @property
    def min_delay(self) -> float:
        return self.floor

    def slow_down(self) -> None:
        self.interval = min(self.max_delay, max(self.interval * 2, self.floor * 2))

    def speed_up(self) -> None:
        if self.interval > self.floor:
            self.interval = max(self.floor, self.interval * 0.9)

    async def wait(self) -> None:
        async with self._lock:
            delay = self._next_at - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            extra = random.uniform(0, self.jitter) if self.jitter else 0.0  # noqa: S311
            self._next_at = time.monotonic() + self.interval + extra


class CircuitBreaker:
    """Pause on repeated throttling; after too many pauses, stop the whole run."""

    def __init__(self, threshold: int, pause_seconds: float, max_pauses: int) -> None:
        self.threshold = threshold
        self.pause_seconds = pause_seconds
        self.max_pauses = max_pauses
        self.consecutive = 0
        self.pauses = 0
        self.open = False
        self.throttle_events = 0

    def record_success(self) -> None:
        self.consecutive = 0

    async def record_throttle(self) -> None:
        self.throttle_events += 1
        self.consecutive += 1
        if self.consecutive < self.threshold:
            return
        self.pauses += 1
        if self.pauses > self.max_pauses:
            self.open = True
            return
        print(
            f"  provider throttling: pausing {self.pause_seconds:.0f}s "
            f"({self.pauses}/{self.max_pauses})"
        )
        await asyncio.sleep(self.pause_seconds)
        self.consecutive = 0


async def _search_with_retry(
    provider: ImageSearchProvider,
    query: str,
    limiter: RateLimiter,
    breaker: CircuitBreaker,
    pacing: Pacing,
) -> list[Candidate] | None:
    """Return candidates, or None if the provider kept failing for this query."""
    peek = getattr(provider, "peek", None)
    if peek is not None:
        cached: list[Candidate] | None = peek(query)
        if cached is not None:  # a cache hit costs no provider call and no pacing
            return cached
    for attempt in range(pacing.retries + 1):
        if breaker.open:
            return None
        await limiter.wait()
        try:
            result = await provider.search(query)
            breaker.record_success()
            limiter.speed_up()
            return result
        except ProviderThrottled:
            limiter.slow_down()
            await breaker.record_throttle()
        except ProviderError:
            await asyncio.sleep(pacing.retry_backoff * (attempt + 1))
    return None


async def process_product(
    product: ProductToEnrich,
    provider: ImageSearchProvider,
    validate: ValidateFn,
    cfg: MatchConfig,
    limiter: RateLimiter,
    breaker: CircuitBreaker,
    pacing: Pacing,
) -> Outcome:
    out = Outcome(product=product, status="no_match")
    best_score = 0.0
    failed_queries = 0
    queries = build_queries(product.name, product.manufacturer, cfg)
    for query in queries:
        if breaker.open:
            out.status = "stopped"
            return out
        cands = await _search_with_retry(provider, query, limiter, breaker, pacing)
        out.queries += 1
        if cands is None:
            failed_queries += 1
            continue
        for cand in cands:
            res = score_candidate(cand, product.name, product.manufacturer, product.category, cfg)
            if res.usable:
                best_score = max(best_score, res.score)
        ranked = rank_candidates(cands, product.name, product.manufacturer, product.category, cfg)
        out.rejected_low_score += len(cands) - len(ranked)
        top = ranked[:3]
        # Validate the top candidates at the same time; keep the best-ranked valid one.
        verdicts = await asyncio.gather(*(validate(c.image_url) for _, c in top))
        out.invalid_urls += sum(1 for ok in verdicts if not ok)
        for (score, cand), ok in zip(top, verdicts, strict=True):
            if ok:
                out.status = "matched"
                out.image_url = cand.image_url
                out.page_url = cand.page_url or None
                out.score = score
                return out
    out.score = best_score or None
    if failed_queries == len(queries):
        out.status = "stopped" if breaker.open else "provider_error"
    return out


def select_products(
    category: str | None, limit: int | None, shuffle: bool
) -> list[ProductToEnrich]:
    order = (
        "random()"
        if shuffle
        else "CASE category WHEN 'Food' THEN 0 WHEN 'Beverage' THEN 1 ELSE 2 END, product_name"
    )
    # `order` and RECHECK_DAYS are module constants, never user input.
    sql = (
        "SELECT id::text, product_name, manufacturer, category FROM products "  # noqa: S608
        "WHERE external_image_url IS NULL AND (image_checked_at IS NULL "
        f"OR image_checked_at < now() - interval '{RECHECK_DAYS} days') "
    )
    params: list[object] = []
    if category:
        sql += "AND category = %s "
        params.append(category)
    sql += f"ORDER BY {order} "
    if limit:
        sql += "LIMIT %s"
        params.append(limit)
    with get_db_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return [ProductToEnrich(str(r[0]), r[1], r[2], r[3]) for r in cur.fetchall()]


def save_outcomes(conn: psycopg.Connection[Any], outcomes: list[Outcome]) -> None:
    """Persist a batch in one transaction. Provider failures are NOT marked checked."""
    batch = [o for o in outcomes if o.status in ("matched", "no_match")]
    if not batch:
        return
    with conn.cursor() as cur:
        for out in batch:
            if out.status == "matched":
                cur.execute(
                    "UPDATE products SET external_image_url = %s, image_source_page = %s, "
                    "image_score = %s, image_checked_at = now() "
                    "WHERE id = %s::uuid AND external_image_url IS NULL",
                    (out.image_url, out.page_url, out.score, out.product.id),
                )
            else:
                cur.execute(
                    "UPDATE products SET image_score = %s, image_checked_at = now() "
                    "WHERE id = %s::uuid AND external_image_url IS NULL",
                    (out.score, out.product.id),
                )
    conn.commit()


def save_outcome(conn: psycopg.Connection[Any], out: Outcome) -> None:
    save_outcomes(conn, [out])


def write_csv(path: Path, outcomes: list[Outcome]) -> None:
    """Review sheet: fill the `label` column (right / wrong / none) to measure precision."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["product_id", "category", "product_name", "manufacturer", "status", "score",
             "image_url", "page_url", "label"]
        )
        for o in outcomes:
            p = o.product
            w.writerow(
                [p.id, p.category, p.name, p.manufacturer, o.status,
                 "" if o.score is None else o.score, o.image_url or "", o.page_url or "", ""]
            )


def print_summary(outcomes: list[Outcome]) -> None:
    total: Counter[str] = Counter()
    matched: Counter[str] = Counter()
    for o in outcomes:
        if o.status in ("matched", "no_match"):
            total[o.product.category] += 1
            if o.status == "matched":
                matched[o.product.category] += 1
    print("\nCoverage by category (matched / searched):")
    for cat in sorted(total):
        pct = 100 * matched[cat] / total[cat]
        print(f"  {cat:<10} {matched[cat]:>4} / {total[cat]:<4} ({pct:.0f}%)")
    accepted = sorted((o for o in outcomes if o.status == "matched"), key=lambda o: o.score or 0)
    if accepted:
        print("\nLowest-scoring accepted matches (review these first):")
        for o in accepted[:10]:
            print(f"  {o.score:.2f}  {o.product.name[:50]} -> {o.page_url or o.image_url}")


async def ingest_image_enrich(
    limit: int | None = None,
    category: str | None = None,
    dry_run: bool = False,
    shuffle: bool = False,
    csv_path: Path | None = None,
    provider: ImageSearchProvider | None = None,
    validate: ValidateFn | None = None,
    products: list[ProductToEnrich] | None = None,
    pacing: Pacing | None = None,
    workers: int | None = None,
    cfg: MatchConfig | None = None,
    use_cache: bool = True,
) -> RunReport:
    report = RunReport(source="image_enrich")
    cfg = cfg or load_match_config()
    pacing = pacing or Pacing(min_delay=settings.image_enrich_min_delay_seconds)
    n_workers = workers or settings.image_enrich_workers
    if provider is None:
        provider = CachedProvider(
            get_provider(settings.image_provider),
            Path(settings.etl_raw_cache_dir) / "image_search",
            enabled=use_cache,
        )
    todo = products if products is not None else select_products(category, limit, shuffle)
    report.fetched = len(todo)
    print(
        f"{'DRY RUN: ' if dry_run else ''}{len(todo)} products to search "
        f"(provider={settings.image_provider}, workers={n_workers}, "
        f"search every {pacing.min_delay:.2f}s, threshold={cfg.threshold})"
    )

    limiter = RateLimiter(pacing.min_delay, pacing.jitter)
    breaker = CircuitBreaker(pacing.throttle_threshold, pacing.pause_seconds, pacing.max_pauses)
    queue: asyncio.Queue[ProductToEnrich] = asyncio.Queue()
    for p in todo:
        queue.put_nowait(p)
    outcomes: list[Outcome] = []
    pending: list[Outcome] = []
    conn = None if dry_run else get_db_connection()
    db_lock = asyncio.Lock()
    started = time.monotonic()

    async def flush() -> None:
        if conn is None:
            return
        async with db_lock:
            batch = pending[:]
            pending.clear()
            if batch:
                await asyncio.to_thread(save_outcomes, conn, batch)

    def progress() -> None:
        done = len(outcomes)
        elapsed = max(time.monotonic() - started, 0.001)
        rate = done / elapsed
        eta_min = (len(todo) - done) / rate / 60 if rate else 0
        matched = sum(1 for o in outcomes if o.status == "matched")
        print(
            f"  progress {done}/{len(todo)} ({100 * done // max(len(todo), 1)}%) "
            f"matched={matched} {rate:.1f} products/s eta={eta_min:.0f}min "
            f"throttled={breaker.throttle_events} interval={limiter.interval:.2f}s"
        )

    async def worker(validate_fn: ValidateFn) -> None:
        while not breaker.open:
            try:
                product = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            out = await process_product(
                product, provider, validate_fn, cfg, limiter, breaker, pacing
            )
            outcomes.append(out)
            pending.append(out)
            if len(pending) >= FLUSH_EVERY:
                await flush()
            if dry_run or out.status == "matched":
                shown = out.image_url or f"none (best score {out.score})"
                print(
                    f"[{product.category}] {product.name[:55]} -> {shown}"
                    + (f"  score={out.score}  page={out.page_url}" if out.image_url else "")
                )
            if len(outcomes) % PROGRESS_EVERY == 0:
                progress()

    try:
        async with httpx.AsyncClient(
            timeout=10.0,
            follow_redirects=False,
            limits=httpx.Limits(
                max_connections=4 * n_workers, max_keepalive_connections=2 * n_workers
            ),
        ) as client:
            validate_fn = validate or partial(validate_image_url, client=client)
            await asyncio.gather(*(worker(validate_fn) for _ in range(n_workers)))
    finally:
        try:
            await flush()  # never lose finished work, even on error or Ctrl-C
        finally:
            if conn is not None:
                conn.close()

    for o in outcomes:
        if o.status in ("matched", "no_match"):
            report.parsed += 1
        report.invalid_url += o.invalid_urls
        report.rejected_low_score += o.rejected_low_score
        report.queried += o.queries
        if o.status == "matched":
            report.matched += 1
            report.images_set += 1 if not dry_run else 0
        elif o.status == "provider_error":
            report.provider_errors += 1
    report.throttled = breaker.throttle_events
    if isinstance(provider, CachedProvider):
        print(f"search cache: {provider.hits} hits, {provider.misses} live searches")
    if breaker.open:
        report.errors.append("circuit breaker opened: provider kept throttling; run stopped early")
    elif report.provider_errors and report.provider_errors == len(outcomes):
        report.errors.append("every product failed with provider errors")
    if csv_path:
        write_csv(csv_path, outcomes)
    print_summary(outcomes)
    return report
