# CheckAm — Product Image Enrichment (ETL extension): Implementation Plan

**Status:** PLAN ONLY. Nothing in this document has been built or run.
**Written:** 2026-11-21
**Goal:** for every product in `products` with an empty `external_image_url`, search the web for a photo of that product, pick one image URL, validate it, and store **only the link** in `external_image_url`.
**Builds on:** `etl/src/checkam_etl/images.py` (URL validation), `http.py` (rate-limited client, cache), `run_report.py`, and the `ck_products_image_https` database constraint. Companion to `IMPLEMENTATION_2.1-3.5_API_AND_FRONTEND.md` (resolves its open question Q5 in favour of building this).

---

## 0. Decisions and ground rules

| Item | Decision |
| :--- | :--- |
| Search source | **`ddgs`** (the free Python package, formerly `duckduckgo-search`; DuckDuckGo Images; no API key). Chosen because it is free and runs from plain Python. |
| Why not Google or browser scraping | Scraping Google breaks its terms and triggers CAPTCHAs, which we never bypass. Driving Edge/Firefox with Playwright is slower and still scraping a search engine. Bing's official image API was retired in 2025. |
| Stored value | **The URL only.** No image bytes are downloaded to our storage (PRD exclusion of server-side image blobs). |
| Privacy | Not a concern for this feature (your decision). The app collects no user location; this job only processes product names already in our database. |
| Reliability | `ddgs` is an **unofficial scraper**: it can rate-limit, change or break without notice. It must sit behind a provider interface (section 2) so a paid API can replace it with no other change. I have not tested its current behaviour; the first task is a small verification (section 5, step 0). |
| Honesty rule | A wrong photo beside a "NAFDAC match" badge is misleading (PRD §5.2). **No image is better than a doubtful image.** Only high-confidence matches are stored; everything else stays `NULL` and the app shows its SVG fallback. |
| Labelling | The UI must describe the photo as "Product photo (not from NAFDAC)". NAFDAC's registry holds no photos. |

## 1. What is being enriched (measured, not assumed)

- 3,618 products today (Food 1,330, Beverage 756, OTC 1,532); `external_image_url` is `NULL` on every row.
- **Expect partial coverage.** Branded food and drink (Indomie, Peak, Milo style names) should match well. Many registrations are bulk, institutional or generic names, and **OTC medicine rows will mostly find nothing reliable** (generic names like "Paracetamol Tablets"). Success is reported as a coverage figure per category, not forced to 100%.
- Names are noisy: casing, pack sizes, stray annotations ("Ibucap Capsules $"), uppercase brand strings. Query building (3.2) handles this.

## 2. Architecture

```
etl/src/checkam_etl/
  sources/image_enrich.py     # orchestrator: select products, run workers, write results
  imagesearch/
    base.py                   # ImageSearchProvider protocol + Candidate dataclass
    ddgs_provider.py          # ddgs implementation (default)
    brave_provider.py         # optional paid fallback, same interface, off by default
  image_match.py              # query builder + candidate scoring (pure functions)
  images.py                   # existing validate_image_url (extended, 3.4)
```

- **Provider protocol:** `async search(query: str, max_results: int) -> list[Candidate]` where a candidate has `image_url`, `page_url`, `title`, `width`, `height`, `source_domain`. Swapping the provider changes one config value, `IMAGE_PROVIDER=ddgs|brave`.
- `ddgs` is synchronous, so each call runs in `asyncio.to_thread` under the worker limit below.
- New dependency: `ddgs` (pinned version). Optional `brave` needs only `httpx` (already installed) and an API key in `.env`.

## 3. Behaviour

### 3.1 Selection and ordering
- Select products where `external_image_url IS NULL` and `image_checked_at IS NULL OR image_checked_at < now() - interval '90 days'` (so a "no match" is not retried every run).
- Process Food and Beverage first (best match rate), then OTC.
- Resumable: results are written in small batches, so an interrupted run loses almost nothing.

### 3.2 Query building
- Base: cleaned product name + manufacturer (for example `BIGI Grape Pineapple Soft Drink Rite Foods`). Strip stray symbols and annotations; drop pack-size tokens for the main query.
- Fallback query (only if the first returns no acceptable candidate): product name alone, plus the word "Nigeria". At most **2 queries per product**.
- For OTC rows, use name plus dosage form and the active ingredient; if still no confident match, store nothing.

### 3.3 Candidate scoring (the quality gate)
Each candidate gets a score; the best one above the threshold wins, otherwise nothing is stored.
- **Positive signals:** brand or distinctive product words appear in the image title or page title; manufacturer name or its main word appears in the page title or domain; the domain belongs to a retailer or brand site rather than a stock or social site; the image is reasonably large (for example at least 300 px on the short side) and roughly square or portrait.
- **Negative signals:** domains on a blocklist (stock photo sites with watermarks, social media, search result pages); thumbnails; very wide banners; titles containing words that indicate a different product or pack.
- The weights and the acceptance threshold live in a config file and are tuned on a labelled sample (section 6), not guessed.
- Store the winning score and `page_url` for audit (3.5).

### 3.4 Validation before saving
Reuse and extend `validate_image_url`:
- `https` only (the database constraint already enforces it); reject private, local and metadata addresses (SSRF guard) and redirects that leave `https`.
- A `HEAD`/short `GET` must return an image content type under a size cap (1.5 MB), within a timeout.
- Failures leave the column `NULL`. No image is downloaded or kept.

### 3.5 What is stored
- Required column (existing): `external_image_url`.
- Small migration `0006_image_provenance` adding nullable columns: `image_source_page TEXT` (page where the photo was found, for attribution and audit), `image_score REAL`, `image_checked_at TIMESTAMPTZ`. The API and UI can then show "Photo from `<domain>`" and a periodic re-check can find stale links.
- Upsert rule already protects existing links: the main ETL must never overwrite a stored image with `NULL` (existing `COALESCE`), and the enrichment job never touches rows that already have a validated link unless re-checking.

### 3.6 Concurrency and politeness
- **3 parallel workers** (`asyncio` semaphore), a global limit of about one query every 2 to 3 seconds, jitter, and exponential backoff (`tenacity`) on rate-limit or empty-error responses.
- Circuit breaker: after a run of consecutive throttling errors, pause for several minutes; after repeated failure, stop and report instead of hammering.
- Expected time for a first full pass: roughly 2 to 3 hours for 3,618 products at this pace. Later runs process only new or stale rows.
- No CAPTCHA or block bypass: if the provider blocks us, the run stops and reports it.

### 3.7 Re-checking and link rot
- Weekly: a cheap pass re-validates a rotating slice of stored URLs (for example 10% per week) and sets broken ones back to `NULL` for re-enrichment. The frontend `onError` SVG fallback already covers links that break between checks.

## 4. Reporting
`RunReport` gains: `queried`, `matched`, `rejected_low_score`, `invalid_url`, `provider_errors`, `throttled`. A run prints coverage by category and the 10 lowest-scoring accepted matches for review. Output goes to `logs/image_enrich_runs.log` like the other sources.

CLI: `checkam_etl run --source image_enrich [--limit N] [--category Food] [--dry-run]`. **`--dry-run` writes nothing** and prints the chosen URL, score and page for each product, so quality can be reviewed before any data is saved.

## 5. Order of work

| Step | Task | Size | Checkpoint you will see |
| :-- | :--- | :-- | :--- |
| 0 | **Verify `ddgs` works from this machine** on 20 products (read-only, no database writes); note rate limits and result quality | S | 20 products with top candidates and a note on throttling |
| 1 | Provider protocol, `ddgs` provider, query builder, scoring, unit tests | M | tests green; scoring table on the sample |
| 2 | **Labelled sample:** 150 products across categories checked by a person (right photo / wrong photo / none); tune weights and threshold | M | precision and coverage figures; the threshold chosen |
| 3 | Migration 0006, extend `validate_image_url`, orchestrator, workers, circuit breaker, report | M | `--dry-run` on 100 products |
| 4 | Full dry run, review, then the real run | S, then about 3 h run | coverage per category; 10 lowest-score matches |
| 5 | Weekly re-check job and hook into the roadmap 1.5 schedule | S | broken-link count |
| 6 | Optional: Brave provider as fallback | S | same tests pass with the other provider |

## 6. Quality gates (definition of done)

- **Precision first:** on the labelled sample, at least **95%** of stored photos are judged to show the right product. If the threshold cannot reach 95% at a useful coverage, raise the threshold and accept lower coverage. Coverage is a secondary goal.
- Zero stored URLs that fail `https`, content-type or size validation; zero private or local addresses.
- Idempotent: a second run changes nothing for rows already matched and does not retry recent "no match" rows.
- `ruff`, `mypy --strict`, tests pass (including offline tests that use recorded provider responses, so the suite never calls the internet).
- Run report and `docs/results_image_enrichment.md` written from real output: coverage per category, precision on the sample, run time, throttling events.
- Every stored image traceable to a `image_source_page`.

## 7. Risks and limits

1. **`ddgs` is unofficial and may break or throttle.** Mitigation: provider interface, pacing, circuit breaker, optional paid fallback (step 6).
2. **Wrong-product photos** are the main harm. Mitigation: scoring gate, 95% precision target, labelled sample, store nothing when unsure.
3. **Copyright:** search results are other people's images. We store links only, keep the source page, and the UI must credit the source and say it is not a NAFDAC image. Whether to use third-party photos commercially is a legal call I cannot make for you (Q1).
4. **Link rot:** links will die; handled by weekly re-checks and the SVG fallback.
5. **Low coverage on medicines** is expected; that is not a failure.
6. **Terms of service:** DuckDuckGo's terms do not clearly grant automated access, so this is a grey area. Keep volume low (one pass plus small weekly checks); switch to a paid API if this becomes a production dependency.

## 8. Decisions I need from you

| # | Question | My recommendation |
| :-- | :--- | :--- |
| Q1 | Are you comfortable linking to third-party product photos, with source credit and a "not from NAFDAC" label? | Yes, with credit and the label; get a legal read before public launch. |
| Q2 | Precision target: 95% (fewer images, rarely wrong) or lower for more coverage? | 95%. A wrong photo on a regulatory record costs more than a missing one. |
| Q3 | Who labels the 150-product sample (step 2)? | You or someone who knows Nigerian products; I can prepare the sheet and score the results. |
| Q4 | Should OTC medicines be included at all? | Run them last and accept low coverage; skip if the sample precision is poor. |
| Q5 | Budget for a paid fallback (Brave) if `ddgs` fails? | Not now; add only if step 0 shows `ddgs` is unusable. |

## 9. Not covered
Downloading or hosting image files, image resizing or proxying, face or watermark detection beyond the domain blocklist, user-submitted photos, and the front-end display work (already covered by `Thumb.tsx` and its `onError` fallback; add the credit line when this lands).
