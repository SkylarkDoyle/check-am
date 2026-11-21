# CheckAm — Backend API and Frontend Integration: Implementation Plan

**Roadmap items covered:** 2.1 (FastAPI endpoints), 2.2 (caching), and the data-integration parts of 3.2, 3.3 and 3.5
**Status:** PLAN ONLY. Nothing in this document has been built or run.
**Written:** 2026-11-21, after the 1.1–1.4 ETL was fixed and re-verified (see `docs/results_1.1-1.4.md`)
**Inputs:** `product_requirements_document.md`, `development_plan.md`, the live `checkam` database, and a read of `frontend/src`.
**Revision 2 (2026-11-21):** records your decisions, adds the category-driven checklist (3.5a, 1.6) and the Toothpaste/Cosmetic data-sourcing workstream (1.5).

## Decisions recorded

Your reply was five numbered answers. I matched them in order to the five blocking questions in my last message; if I matched any wrongly, tell me and I will correct this table.

| # | Question | Your answer | Effect on the plan |
| :-- | :--- | :--- | :--- |
| 1 | Recreate `backend/.venv` on Python 3.12? | **Yes** | Backend runs on **3.12**. `uv` already has `cpython 3.12.12` installed, so no download of a new interpreter is needed (2.1). |
| 2 | In-memory cache now, Redis later? | **Later** | Redis is deferred; the cache interface stays so it can be added without touching routes (2.5). |
| 3 | Host and PostgreSQL version | **"Okay"** (no host named) | I read this as accepting my recommendation: choose the host later, one that offers your chosen Postgres version and lets you disable client-address logging. **Still open: no host or version is chosen.** Q1 and Q4 stay on the list. |
| 4 | Ship without Toothpaste/Cosmetic data? | **No: find ways to get that data** | New workstream 1.5. This is now a **release requirement**, not a limitation. |
| 5 | Banner-only alerts acceptable? | **Yes** | The product-level alert badge is built but stays hidden until alert links exist (1.3). |

Added by you: **the checklist must be dynamic by product category** (`ResultScreen.tsx`, `ChecklistItem.tsx`). See 3.5a and 1.6.

---

## 0. Read this first: what I found that changes the plan

The plan is written around these facts, so they come first. Each was measured or read directly; none is assumed.

### 0.1 The frontend runs entirely on invented data

`frontend/src/db/index.ts` seeds Dexie with `SEED_PRODUCTS` and `SEED_ALERTS`. These are fabricated, not NAFDAC data.

- **Wrong attributions.** The seed says "Public Alert 031/2026" concerns "Kelvin Pure sachet water". In the real database, Alert No. 031/2026 is a sexual-enhancement product recall. The seed also has a mercury alert (028/2026) about "Crusader Medicated Soap" that does not appear in any NAFDAC data we ingested (the database has no 028/2026). Statements like these, attached to real-sounding brands, are exactly the defamation exposure PRD §5.2 forbids.
- **Fake fallbacks in the UI.** `ResultScreen.tsx:266-267` shows `'14 Mar 2028'` and `'NAFDAC registry, 18 Nov'` whenever real values are missing.
- **Fake scanner.** `ScanScreen.tsx` "recognises" a code automatically after 1.8 s (`scheduleSimulatedDetection`). There is no OCR or barcode library in `package.json`.
- **Fake not-found.** `App.tsx:73-86` builds an invented "Unregistered Pack" product with status `lapsed` when a scanned code is unknown. PRD wording for this case is "Not Found in Indexed Registry", which is not the same as "lapsed".

**Decision:** all seed data and hard-coded fallbacks are deleted in Phase 3. Nothing the user sees may come from anywhere except the API or a synced copy of it.

### 0.2 The database cannot yet supply everything the screens show

| Screen needs | Database today | Consequence |
| :--- | :--- | :--- |
| "Valid until" date | **No expiry column.** The ETL reads `expirydate` / `expiry_date`, uses it to set `status`, then discards it. | New migration and ETL change (Phase 1). |
| Pack size, dosage form | Not stored (portals provide `packsize`, `form_name`). | Add if wanted (optional). |
| Alert summary text | `safety_alerts.summary` is **boilerplate**: `"** Customer Service Lines: For Enquiries call 0700-1-NAFDAC …"` on all 14 rows. | Home banner and share text would show phone numbers. Must be repaired (Phase 1). |
| Alert batch numbers | Junk on several rows (`'es'`, `'All'`, `'Manufacturing/Expiry'`). | Clean or null (Phase 1). |
| Alert titles | Contain encoding damage (`�`) and the full title is stored in `product_name`. | Clean text, split title and product (Phase 1). |
| Alert to product link | **0 of 14 alerts are linked to a product**; 0 products are `Alert_Flagged`. | The "Official NAFDAC Public Alert" badge on a product can never appear. See 1.3. |
| Toothpaste and Cosmetic category | **0 rows.** Only Food 1,330, Beverage 756, OTC 1,532. NAPAMS (the source for these) is blocked by CAPTCHA. | The "Care" chip would always be empty. **Now a release requirement: see 1.5.** |
| Packaging checklist | 5 categories in `packaging_checklists`, 6 points each, but **5 of the 6 points are identical in every category**; only the 6th differs. The frontend ignores the table and hard-codes 3 points for every product. | Checklist is not really category-driven yet. See 0.5, 1.6, 3.5a. |

### 0.3 Measured sizes (they make some decisions easy)

- **Offline catalogue:** 3,618 products with the six core fields = 367 KB JSON, **93 KB gzip**. The plan allows 2.5 MB. A **full bundle** is therefore cheap, so **delta sync is deferred**; it would also need deletion tombstones that the schema does not have.
- **Current JS bundle:** 306 KB raw, **94.7 KB gzip**, against a 150 KB budget (NFR002). About **55 KB gzip** of headroom remains for the API client, sync worker and search. OCR (Tesseract) and the barcode reader must be lazy-loaded when they are built.
- **Search speed:** a trigram query on the database took **2.3 ms**; the budget is 300 ms p95.

### 0.4 Environment facts

- `backend/` contains only a `.env` (`DATABASE_URL`, `TEST_DATABASE_URL`) and an **empty** virtualenv on **Python 3.14.3**. **Decision: recreate it on Python 3.12** (the dev-plan version). `uv python list` shows `cpython 3.12.12` already installed, so this is `uv venv --python 3.12 backend/.venv` with no download. (The ETL runs on 3.11; both are fine, but the backend must not diverge from the version used in deployment.)
- No Redis is available locally (Docker is not installed on this machine). Caching must work without it.
- PostgreSQL is 18.2 locally versus 16 in the plan (discussed earlier).
- The frontend has no linter, no test runner and no OpenAPI client tooling.

### 0.5 Checklist: what exists today (relevant to your "dynamic by category" request)

- **Frontend** (`ResultScreen.tsx:38-57`): three hard-coded points ("Seal intact", "Number matches", "Expiry date format") shown for every product. Only the registration number inside "Number matches" varies. The synced `packaging_checklists` table is never read.
- **Component** (`ChecklistItem.tsx`): presentational and fine. It has three states (`todo`, `done`, `flag`), is keyboard accessible, and takes `title` and `detail`. It needs no change to render dynamic content; only a small optional addition (3.5a).
- **Database:** `packaging_checklists` has one row per category (`Food`, `Beverage`, `Toothpaste`, `Cosmetic`, `OTC`) holding 6 points. Points 1–5 are the same text everywhere; point 6 is the category-specific one (Beverage: cap security ring; Cosmetic: INCI ingredient naming; Food: net weight and ingredients; OTC: dosage and blister pack; Toothpaste: nozzle foil seal).
- **`expected_reg_prefix` is unreliable.** It says Food and Beverage are `A8-`, but the ingested registry shows `A8-` is only roughly three quarters of them (A5-, B1-, 01-, 08- and others are common). It must not drive any "your number looks wrong" hint. See 1.6.
- **Pack type matters more than category.** "Cap security ring" is wrong for sachet water, and "blister pack" is wrong for a syrup. Category alone is too coarse, so the design in 3.5a selects by category **and** a finer pack variant.

---

## 1. Phase 1 — Close the data gaps (before the API can be honest)

These are small ETL and migration changes. They come first because the API would otherwise publish wrong or empty fields.

### 1.1 Migration `0004_registration_dates`

Add nullable columns to `products`: `registered_on DATE`, `expires_on DATE`.
**Required now (for the dynamic checklist, 1.6):** `pack_type VARCHAR(40)`, a controlled value derived deterministically from the source (Greenbook `form_name` is clean: tablet 618, syrup 241, capsule 124, suspension 108, cream 69 among OTC rows; FoodDB `presentation` is usable but patchy: glass bottle, sachet, PET bottle, nylon, plastic container, with about 117 blank and some "n/a"). Unknown stays `NULL`; it is never guessed. Report coverage by source.
Optional, only if the product team wants them on screen: `pack_size VARCHAR(120)`, `dosage_form VARCHAR(60)`.

ETL changes:
- FoodDB: map `issuedate` to `registered_on` and `expirydate` to `expires_on`. Dates are `dd/mm/YYYY`-style strings; parse with the existing `_parse_date` and store `NULL` on failure. **Never invent a date.**
- Greenbook: `approval_date` to `registered_on`, `expiry_date` to `expires_on`.
- `status` remains derived from `expires_on` (and Greenbook's `status`), unchanged.
- Upsert: `expires_on` and `registered_on` are overwritten by the incoming value (they are source facts, not enrichments).

Acceptance: `SELECT count(*) FILTER (WHERE expires_on IS NULL)` is reported by source; any `Expired` row has `expires_on < current_date` or comes from Greenbook `Inactive`.

### 1.2 Repair `safety_alerts` content

The alert ETL (`sources/alerts_pdf.py`) stores page chrome instead of the notice text. Fix at the source and re-ingest:

1. **Summary** = the first meaningful paragraph(s) of the article body (strip the "Customer Service Lines" block, nav and footer), max about 600 characters, plain text, whitespace-collapsed. If extraction fails, store the **title only**, never boilerplate.
2. **Text hygiene:** decode HTML entities, normalise the `�` damage (fix the response charset to UTF-8, fall back to cp1252), replace non-breaking spaces.
3. **Title / product split:** keep the official title in a new column `title`; `product_name` is a best-effort product mention or NULL. Do not guess.
4. **Batch numbers:** accept only tokens that look like batch codes (alphanumeric, contain a digit, length 4–20), from text introduced by "Batch No/Number". Otherwise NULL.
5. **Gazette PDFs:** the plan says `pdfplumber` for Gazette PDFs, but only the HTML posts are parsed today. Out of scope for this plan; record as a known gap.

Acceptance: no alert summary contains "Customer Service Lines"; no mojibake characters; every `official_source_url` is a `https://nafdac.gov.ng/` link.

### 1.3 Alert to product linking (legal-safety rules)

- Link an alert to a product **only on an exact registration-number match** found in the alert text (regex for the NAFDAC formats seen in the data, normalised with the same rule as `normalized_reg_num`).
- **Never** link by fuzzy name. A fuzzy link would attach an official alert to the wrong brand, which is the defamation risk.
- A product is `Alert_Flagged` only when an **active** alert links to it. When the alert is deactivated, the status returns to what the registry dates say.
- Most alerts name no registration number, so expect few links. The home-screen alert banner (which needs no link) is the main surface. State this to stakeholders so a mostly empty "alert" badge is not read as a bug.
- Add a migration to re-add integrity: `safety_alert_products(alert_id, product_id)` link table instead of the dropped FK, which also supports one alert → many products.

### 1.4 Phase 1 exit check

Re-run the ETL, then show: counts, `expires_on` and `pack_type` coverage, five sample alerts with clean summaries, and the number of linked alerts. Update `docs/results_1.1-1.4.md`.

### 1.5 Toothpaste and Cosmetic data (release requirement, source not yet found)

You decided the app must not ship without this data. I searched for a lawful public source. **I did not find one.** What I checked on 2026-11-21:

| Place | Result |
| :--- | :--- |
| NAFDAC home page | Lists "Registered Products (non drug) Database" as a service, but it is **plain text with no link** (checked in a browser: no anchor around it). |
| Guessed URLs (`cosmetics-products-database`, `non-drug-products-database` and 3 similar) | All 404. |
| NAFDAC Cosmetics and Cosmetics Guidelines pages | Only guideline and regulation PDFs (for example the Cosmetics Products Registration Regulations 2023 and Cosmetic Products Labelling Regulations 2021). No registered-product list. |
| Greenbook (already ingested) | Categories are Drugs, Medical devices, Vaccines and Biologics, Herbals and Nutraceuticals, Veterinary, Disinfectants, N/A. **No cosmetics or toothpaste.** |
| FoodDB (already ingested) | Food only. The 94 rows matching words like "cream" or "soap" are ice cream and creamer. |
| NAPAMS (`registration.nafdac.gov.ng`) | NAFDAC says cosmetics are registered through it, but it needs a login, a CAPTCHA token and a certificate number. The ETL skips it by rule (no CAPTCHA or login bypass), and that stays. |
| "List of Products Analysed in CDCL 2021" (NAFDAC PDF) | Includes cosmetics, but it is a **laboratory analysis list, not a registry**. Using it as registration status would be wrong and is ruled out. |

Ways forward, in the order I would pursue them:

1. **Spike (half a day): look for a hidden public listing.** Check the public WordPress sitemap and REST search (`/wp-sitemap.xml`, `/wp-json/wp/v2/pages?search=database`) for the "non drug" database page, and open NAPAMS's public pages in a browser to see whether any search works without login. Public, read-only, polite rate limit; no login or CAPTCHA interaction.
2. **Ask NAFDAC directly.** Send a written request to the NAFDAC directorate responsible for cosmetics registration (and the ICT/data unit) for the registered non-drug product list, or permission and an access route to NAPAMS records. This is the only route that gives complete data and clear permission. **I can draft the request; you or CheckAm must send it.** Timeline is outside our control, so it should start now.
3. **If NAPAMS only offers login and CAPTCHA:** do not automate it. Options are an official data-sharing agreement, or a licensed NAFDAC account used by a person to export lists NAFDAC permits you to export.
4. **Do not use:** the lab-analysis PDF, scraped retailer sites as "registration proof", or user submissions (excluded by the PRD).

**ETL work once a source exists** (small, because the pipeline is ready): a new `sources/nonfood_registry.py` using the same normalise, dedupe, date and upsert code; map to the existing `Toothpaste` and `Cosmetic` categories (the database constraint already allows them); toothpaste identified from the portal's own subcategory field, not by guessing from names; run report with counts and rejects.

**Release gate:** at least the agreed minimum of verified Toothpaste and Cosmetic records, each with a registration number, status and expiry date, from an authorised source (Q9 sets the number; I suggest at least 200 records including the major toothpaste brands). Until it is met, **launch is blocked** by your decision.

**Honesty rule that applies from day one, even before the data arrives:** a search miss must not read as "not registered". `/meta` returns a `coverage` list of the categories actually indexed, and the Not Found screen says: "Not found in the indexed registry. CheckAm does not yet cover toothpaste or cosmetics." (That sentence is removed only once those categories are loaded.) Otherwise a genuine, registered toothpaste would be shown as unverified.

**Schedule risk:** this item has an unknown duration because it depends on NAFDAC. Phases 2 and 3 do not depend on it and should proceed.

### 1.6 Checklist content and model (supports the dynamic checklist)

- **Migration `0005_checklist_variants`:** `packaging_checklists` gains `variant VARCHAR(60) NOT NULL DEFAULT ''` and its primary key becomes `(category, variant)`. A row with `variant = ''` is the category default. Points move from free-form objects to a fixed shape: `{key, label, detail, kind}` where `kind` is `common` or `specific`. `detail` may contain two tokens, `{reg_number}` and `{expiry_example}`, filled in by the client.
- **Resolution rule:** product `(category, pack_type)` → matching variant row if it exists, else the category default row, else a built-in generic list of the 5 common points. A product therefore always gets a checklist.
- **Initial variants** (only where the pack genuinely changes the checks): `Beverage/glass_bottle`, `Beverage/pet_bottle`, `Beverage/sachet`, `Food/sachet`, `Food/tin`, `OTC/tablet`, `OTC/capsule`, `OTC/syrup`, `OTC/cream`, `Toothpaste` and `Cosmetic` defaults. Add more only from real `pack_type` values with enough products.
- **Remove `expected_reg_prefix` from user-facing logic.** The data does not support one fixed prefix per category (see 0.5). Keep the column for internal analysis, but no checklist item may tell the user their number "looks wrong". If NAFDAC publishes a prefix rule, add it then, with the source cited.
- **Content must be sourced, not invented.** These points are safety guidance shown to the public. Every point added beyond the current seed needs a source (NAFDAC consumer guidance or labelling regulations) recorded in a `source` note in the migration or a docs table, and a legal read before release. Wording stays neutral: checks describe what to look for, never a verdict on the product.
- **PRD FR005 coverage check:** hyphen versus slash date format, foil seal, tamper seal, print sharpness must each appear in at least one category's list; the test in 3.8 asserts this.

---

## 2. Phase 2 — Backend API (roadmap 2.1)

### 2.1 Stack and layout

**Python 3.12** (decision; venv recreated with `uv`, see 0.4). FastAPI, Pydantic v2, **psycopg 3 async with `psycopg_pool`** (already used by the ETL; raw parameterised SQL keeps the trigram operators simple and fast). No ORM. Config via `pydantic-settings` from `backend/.env`.

```
backend/
  pyproject.toml            # ruff + mypy strict, same rules as the ETL
  app/
    main.py                 # app factory, middleware, router mount
    settings.py             # DATABASE_URL, REDIS_URL (optional), CORS_ORIGINS, RATE_LIMITS
    db.py                   # async pool lifecycle
    cache.py                # Cache protocol: InMemoryTTL (default) and Redis (if REDIS_URL set)
    reg.py                  # normalize_reg(), looks_like_reg(); parity-tested against the SQL column
    schemas.py              # Pydantic response models (the contract in 2.3)
    queries.py              # all SQL in one place
    routers/
      products.py  search.py  alerts.py  checklists.py  sync.py  meta.py  health.py
  tests/                    # pytest + httpx.AsyncClient against TEST_DATABASE_URL
```

### 2.2 Status and vocabulary (single source of truth)

| Database `status` | API `status` | Meaning shown to users |
| :--- | :--- | :--- |
| `Active` | `match` | Official NAFDAC Registry Match |
| `Expired` | `lapsed` | Registration Lapsed / Unverified |
| `Alert_Flagged` | `alert` | Official NAFDAC Public Alert (links to the bulletin) |
| no record | `not_found` (result type, not a product) | Not Found in Indexed Registry |

The API never emits the words "fake" or "counterfeit" as a verdict. Alert titles are quoted from NAFDAC verbatim, with the source link, as PRD §5.2 allows.

Category mapping lives in the API (not the UI): `Food`→`Food`, `Beverage`→`Drinks`, `Toothpaste`/`Cosmetic`→`Care`, `OTC`→`Meds`. The raw database category is also returned as `category_raw`.

### 2.3 Endpoint contract (`/api/v1`)

All responses are JSON, UTF-8. Errors use `{"error": {"code": "...", "message": "..."}}` with correct HTTP status.

| Method and path | Purpose | Key parameters | Notes |
| :--- | :--- | :--- | :--- |
| `GET /health` | Liveness | – | No database call. |
| `GET /ready` | Readiness | – | Checks pool + `SELECT 1`; used by the host. |
| `GET /products` | Home feed, infinite scroll | `category`, `limit` (default 10, max 50), `cursor` | **Keyset** pagination on `(product_name, id)`, not OFFSET. Returns `next_cursor`. |
| `GET /products/{id}` | Detail | – | 404 if unknown. Includes the **resolved checklist** (category and `pack_type`, rule in 1.6) and linked alerts. |
| `GET /products/lookup` | Scan / reg-number check | `reg` (required) | Normalises input; returns an **array** (a registration number can map to several products) plus `result: match / multiple / not_found`. |
| `GET /search` | Typed search | `q` (2–80 chars), `category`, `limit` (default 20, max 50) | See 2.4. |
| `GET /alerts` | Banner and alerts list | `active` (default true), `limit` | Newest first by `issued_date`. |
| `GET /alerts/{id}` | One alert | – | Includes `official_source_url`. |
| `GET /checklists` | All checklist rows (every category and variant) | – | Used by the sync bundle so checklists work offline. Each point is `{key, label, detail, kind}`. |
| `GET /checklists/resolve` | Resolve one product's checklist | `category` (required), `pack_type` (optional) | Same resolution rule as the client (1.6), so a live lookup and the offline copy always agree. |
| `GET /sync/manifest` | Is my local copy current? | – | `{version, generated_at, product_count, alert_count, bytes, sha256}`. Cheap; supports `ETag` / `If-None-Match`. |
| `GET /sync-bundle` | Offline catalogue | – | gzip JSON: products (core fields plus dates), alerts, checklists, meta. `ETag` = `sha256`. |
| `GET /meta` | Disclaimer, last sync, counts, sources, **coverage** | – | The mandatory PRD §5.2 disclaimer text is served from here so legal copy lives in one place. `coverage` lists the categories actually indexed (today Food, Drinks, Meds), and drives the Not Found wording and the category chips (1.5). |

**Product object** (shape the frontend will receive):

```json
{
  "id": "uuid",
  "reg_number": "A8-100791",
  "reg_normalized": "A8100791",
  "name": "BIGI Grape - Pineapple Soft Drink",
  "brand": null,
  "category": "Drinks",
  "category_raw": "Beverage",
  "pack_type": "pet_bottle",
  "manufacturer": "Rite Foods Ltd",
  "status": "lapsed",
  "registered_on": "2022-03-14",
  "expires_on": "2025-03-13",
  "image_url": null,
  "source": "FoodDB",
  "last_synced_at": "2026-11-21T08:02:53Z",
  "alerts": []
}
```

`brand` is null for every row today (neither portal has a brand column); the UI must show the name instead of inventing a brand.

### 2.4 Search design

1. Trim, collapse whitespace, cap at 80 characters; reject control characters.
2. **Registration-number path** when the query looks like a number (`looks_like_reg`: has a digit, 3–20 alphanumerics after stripping `- `): exact `normalized_reg_num = $1` first, then prefix `LIKE $1 || '%'`, ordered exact-before-prefix. Uses `idx_products_norm_reg`.
3. **Name path:** `product_name % $q` with `SET LOCAL pg_trgm.similarity_threshold = 0.25` (tunable), ordered by `similarity(product_name, $q) DESC`, plus an `ILIKE` substring branch so short exact words still match. Manufacturer is a lower-ranked branch. Uses `idx_products_name_trgm`.
4. Always `LIMIT`. Results carry `match_type` (`reg_exact | reg_prefix | name | maker`) so the UI can explain why a row appeared.
5. Acceptance (from PRD FR002): `01-1234` and `011234` return the same record; `"Cerelack"` finds Cerelac (verified against a seeded test row, not assumed against live data); p95 under 300 ms at 20 concurrent requests.

### 2.5 Caching (roadmap 2.2) — optional Redis

- `Cache` interface with an in-process TTL implementation (default, no infrastructure) and a Redis implementation selected only when `REDIS_URL` is set. The code path is identical.
- Cached: `/sync/manifest` and `/sync-bundle` (keyed by data version, rebuilt after each ETL run), `/alerts`, `/meta`, `/checklists` (TTL 5–15 min), and normalised search queries (TTL 60 s, key = normalised query + category).
- HTTP caching: `Cache-Control: public, max-age=…` plus `ETag` on the bundle and manifest; `private, no-store` is **not** used for these because they hold no personal data.
- **Redis is deferred (your decision).** With a 93 KB gzip bundle and a 2 ms query, the in-memory cache is enough for launch; add Redis when running more than one API instance (so caches do not diverge). This deviates from "Redis from day one" in the dev plan, and the deviation is now approved. Roadmap item 2.2 is therefore delivered as the cache interface plus in-memory implementation; the Redis implementation is a later task.

### 2.6 Security, privacy, abuse (NFR006, PRD §4)

- CORS allow-list from `CORS_ORIGINS` (the PWA origin only, plus `localhost:5173` in dev). No wildcard.
- Rate limiting per client address on `/search` and `/products/lookup` (for example 60 per minute), implemented in the cache layer so it also works with Redis later.
- Parameterised SQL only; length and charset validation on every input; `limit` caps.
- Security headers (`X-Content-Type-Options`, `Referrer-Policy: no-referrer`, HSTS at the host).
- **No accounts, no cookies, no analytics, no request-body logging.** Application logs record path, status and timing, not client address or query text. State plainly to the host choice (Q4) that platform access logs may still retain addresses; NFR006 ("zero location tracking") has to be checked against the chosen host.
- Images: the API only passes through `external_image_url` (HTTPS enforced by a database constraint). No image proxy in the MVP. A strict `img-src` CSP on the PWA limits where images may load from (see 3.7).
- Secrets only in `.env`, which stays gitignored.

### 2.7 Backend tests and gates (dev plan §5)

- `ruff` and `mypy --strict` clean.
- pytest with `httpx.AsyncClient` on a test database seeded by a fixture (never the live `checkam` rows): status mapping, keyset pagination (no duplicates or gaps across pages), lookup with shared registration numbers, search ranking, 404 and validation errors, ETag/304 behaviour.
- **Contract test:** generate the OpenAPI schema and run `schemathesis` against it; the frontend types are generated from the same schema (3.2) so they cannot drift.
- **Parity test:** `reg.normalize_reg` equals the database generated column for every live registration number.
- **Latency gate:** a script runs 200 requests at concurrency 20 against `/search` and fails if p95 ≥ 300 ms.
- **Alert-safety test:** no response contains the words "fake" or "counterfeit" except inside a verbatim NAFDAC title.

---

## 3. Phase 3 — Frontend integration

### 3.1 Principle: local-first, API-assisted

Per PRD FR002 and NFR004, the PWA searches **IndexedDB first**. With a full catalogue synced locally, ordinary use needs no network. The API is used for: the first sync, keeping the copy current, and a live fallback when the local copy is empty or a lookup misses and the device is online.

```
App start ──► Dexie has catalogue? ─yes─► render from Dexie (offline-safe)
                         │no                        │
                         ▼                          ▼
                first sync (needs network)    background: GET /sync/manifest
                bundle → Dexie (atomic)       version changed? → bundle → Dexie
```

### 3.2 Data layer (new `src/api` and `src/data`)

- `src/api/client.ts`: `fetch` wrapper with timeout (8 s), `VITE_API_BASE_URL`, JSON error mapping, and `AbortController` for search-as-you-type cancellation.
- `src/api/types.ts`: **generated** from the backend OpenAPI schema (`openapi-typescript`, dev dependency only, so zero runtime bytes).
- `src/data/mappers.ts`: API object to the UI `Product` type. This also fixes the messy `ProductCategory` union in `types/index.ts`, which currently mixes `Food/Drinks/Care/Meds` with `Food & Dairy/Beverages/...`; it becomes the four UI categories only.
- `src/data/repository.ts`: the only module screens may import for data: `listProducts`, `searchProducts`, `lookupReg`, `getProduct`, `listAlerts`, `getChecklist`. Screens never touch Dexie or `fetch` directly (today they call `db` in 6 files).

### 3.3 Dexie schema v2 and the sync worker

- **Schema v2** (Dexie `version(2).upgrade`): stores `products` (key `id`; indexes `reg_normalized`, `category`, `status`, `name_lc`, plus `pack_type`), `alerts`, `checklists` (compound key `[category+variant]`), `checklist_progress` (compound key `[productId+pointKey]`, 3.5a), `saved` (kept; user data must survive the upgrade), `settings`. The upgrade **deletes the fabricated seed rows** (identified by their `prod-` / `alert-` ids) and keeps `saved` rows only if their `productId` still exists after the first real sync.
- **Sync** (`src/data/sync.ts`): runs on app start, on the `online` event, on the About screen's "Update now", and when "auto update" is on. Steps: `GET /sync/manifest` with `If-None-Match` → if changed, download `/sync-bundle` → verify `sha256` → write in **one Dexie transaction** (clear and bulk-add) so a failed or interrupted sync never leaves a half-empty catalogue → store `lastSynced` as an ISO timestamp and the **real** product count.
- States for the existing frames: first-sync progress, offline-and-empty ("Connect once to download the registry"), sync failed with retry, up to date.
- `autoUpdate` setting gates only the background check, never the first sync.

### 3.4 Search and feed on the client

- Local search mirrors the server rules (2.4): reg-number exact/prefix first, then name. With 3,618 rows an in-memory scan is well under the 50 ms budget; add a `name_lc` index and a **tiny trigram scorer (about 1 KB of code)** for typo tolerance. Do **not** add a fuzzy-search library; the bundle headroom is only about 55 KB gzip.
- Home "All products": keyset by `(name_lc, id)` from Dexie, 10 per page, using the existing infinite-scroll design.
- Category chips are generated from `/meta.coverage` (categories that actually have rows), so an empty "Care" chip is not shown. When Toothpaste and Cosmetic data lands (1.5) the chip appears with no code change.

### 3.5 Screen-by-screen changes

| Screen | Change |
| :--- | :--- |
| `HomeScreen` | Alerts banner from `listAlerts()` (verbatim title, issued date, "Official NAFDAC Public Alert"); product grid from the repository; remove `db.*` calls. |
| `SearchScreen` | Replace substring filter with the repository search; show `match_type` hint; debounce 150 ms; cancel in-flight requests. |
| `ResultScreen` | Load by id; **delete** the `'14 Mar 2028'` and `'NAFDAC registry, 18 Nov'` fallbacks: show `expires_on` or "Not listed". Checklist is category-driven and comes from synced `checklists` via a resolver (3.5a); the hard-coded 3-point array at lines 38-57 is deleted. Share text uses the alert's real `official_source_url` and the mandatory disclaimer from `/meta`. Image uses `image_url` with the existing `onError` SVG fallback (already in `Thumb.tsx`). |
| `ScanScreen` / `App.handleScanResult` | Keep the screen; route a detected code to `lookupReg()`. `multiple` opens the search results list; `not_found` opens the **Not found** view (existing Doop frame), not a fake product with status `lapsed`. The real hands-free OCR is specified in 3.5b (Tesseract.js, number only); the simulated 1.8 s detection is deleted there. |
| `SavedScreen` | Unchanged storage; on open, re-resolve each saved product by id and show current status (a saved "match" may have lapsed since). |
| `AboutScreen` | Real last-synced time, real catalogue count, working "Update now" with progress and error text. |

### 3.5a Dynamic checklist by category (`ResultScreen.tsx`, `ChecklistItem.tsx`)

**Goal:** the checklist a user sees depends on what they are holding, and ticks are remembered.

**Resolver** (`src/data/checklist.ts`, pure function, unit-tested): `resolveChecklist(product, rows)` returns an ordered list of points:
1. Look up `[category + pack_type]`; if absent, `[category + '']`; if absent, the built-in generic five. The same rule runs on the server (`/checklists/resolve`), and a shared fixture test proves they agree.
2. Order: `common` points first, then `specific` points.
3. Fill tokens in `detail`: `{reg_number}` from the product, `{expiry_example}` from the product's own `expires_on` format only when present, otherwise a neutral example. No other substitution is allowed (so server content cannot inject markup; text is rendered as text, never HTML).
4. Offline: resolved from the synced `checklists` store, so it works with no network.

**`ResultScreen.tsx` changes**
- Remove the local `useState<ChecklistPoint[]>` literal; derive points from `resolveChecklist` in a `useMemo` keyed by product id.
- Replace the in-memory toggle with a hook `useChecklistProgress(productId)` backed by the `checklist_progress` Dexie store. Ticks survive leaving the screen and reopening the app, and are scoped per product.
- Section heading shows the category and a progress line: "Check the pack: 3 of 6 looked at". The heading wording is neutral.
- If the product has no category match at all, show the generic five (never an empty section).

**`ChecklistItem.tsx` changes (small, backward compatible)**
- Keep the current three states and keyboard behaviour.
- Add optional `flagHint?: string`. When `state === 'flag'`, render this line under the detail. Default copy: "You marked this as different from the record. Compare with the product and the NAFDAC record, or call 0800-1-NAFDAC." It must never say a product is fake or counterfeit, and it must not change the product's status badge: a user flag is a personal note, not a verdict (PRD §5.2).
- Add `aria-label` combining title and state so screen readers announce "Seal intact, not checked".
- No fetching or Dexie access inside the component; it stays presentational.

**Saved checks:** when a check is saved, store the progress count (for example "4 of 6") with it so the Saved list can show it; the per-point ticks stay in `checklist_progress`.

**Acceptance**
- Opening a Beverage/glass-bottle product shows the cap-ring point; an OTC tablet shows the blister-pack point; an OTC syrup does not show blister-pack wording.
- Two products of the same category and pack type show identical points but each shows its own registration number.
- Tick a point, reload the browser, reopen the product: the tick remains. Turn the network off: the checklist still renders.
- Snapshot test: no rendered checklist text contains "fake" or "counterfeit".
- A category with no row in the database falls back to the generic five.

### 3.5b Hands-free NAFDAC-number scan (`ScanScreen.tsx`, roadmap 3.4)

**Decision: use Tesseract.js (OCR). Do not use zxing-wasm for this feature.** A NAFDAC registration number (for example `A8-100791`) is printed text, not a barcode, so a barcode decoder can never return it. zxing-wasm stays out of V1; it would only matter if you later want lookup by EAN/UPC barcode.

**Scope:** the scanner reads the **NAFDAC number only** (not product names), with no shutter button. The recognised number appears in the recognition bubble as "Got it! `<number>`".

**Continuous loop (no trigger)**
1. Open the camera (already done in `ScanScreen.tsx`, rear camera, 1280x720 ideal).
2. About twice a second, copy a **narrow centre strip** of the frame onto a small canvas, width at most 720 px (PRD FR003). Grayscale and contrast-stretch it before OCR.
3. Run Tesseract in a **web worker** with a character whitelist (`A-Z 0-9 -`) and single-line page mode.
4. Keep a result only if it matches the NAFDAC pattern (1 to 2 letters or digits, a dash, then 4 to 6 digits). All other text is discarded. The pattern is tuned against the real registration numbers in the database (formats such as `A8-100791`, `04-4753`, `01-0647`), and the date-mangled forms we reject in the ETL (`Aug-67`) are never accepted.
5. **Accept only when the same value is read twice in a row.** This stops single-frame misreads (`8` for `B`).
6. On accept: stop scanning, show "Got it! A8-100791" in the bubble, vibrate, then call `lookupReg()` (3.5). The number is a **pre-fill for the user to see, never a verdict**; the result screen supplies the registry facts (PRD §5.1).
7. If nothing is accepted within 15 seconds, show "Having trouble? Type the number instead" linking to the existing type-instead path.

**Performance and memory (NFR005)**
- Lazy-load Tesseract and its language data only when the scan screen opens, via dynamic `import()`, so the main bundle stays under budget (about 55 KB gzip headroom, 0.3). Cache the language file in the service worker for offline use. Use the English model with digits and a whitelist, not the full multi-language set.
- Process one frame at a time (skip a tick if the previous OCR is still running); pause when the tab is hidden; stop the camera tracks and terminate the worker when leaving the screen.
- Target: recognised number within 2.5 s of a clear, steady view (FR003); peak browser memory below 150 MB on a 2 GB phone (measured, not assumed).

**Cleanup in `ScanScreen.tsx`**
- Delete `scheduleSimulatedDetection` (the fake "recognise after 1.8 s"). It must not ship.
- Bubble states: scanning ("Hold the number inside the frame"), recognised ("Got it! A8-100791"), timeout (type-instead prompt), camera blocked (existing frame).
- Never upload frames: all processing is on the device (FR003, NFR006).

**Known limits:** curved or shiny packs, dim light and small print will lower accuracy; the type-instead path is the fallback. A torch toggle (where the browser supports it) is optional.

**Acceptance**
- Pointing the camera at a printed sample number (test cards for 8 real database numbers, several fonts, normal and dim light) yields the correct number in the bubble in at most 2.5 s for at least 80% of attempts, with no wrong number accepted in a run of 50 frames of non-NAFDAC text.
- No button press is needed; no network request is made during scanning (checked in the network panel).
- Main bundle size unchanged by the feature; Tesseract loads only on the scan screen.
- Heap stays below 150 MB during a 60 s scan on a throttled low-memory profile.

### 3.6 Legal and copy audit (dev plan §5)

Run a script over the built bundle and API fixtures that fails if "fake", "counterfeit" or "scam" appears anywhere except in NAFDAC alert titles, and checks every product screen renders the mandatory disclaimer. Not-found copy: "Not found in the indexed registry. Check the spelling or the pack."

### 3.7 PWA and delivery settings

- `vite.config.ts`: add `/api` dev proxy to `http://localhost:8000`.
- Workbox runtime caching: `StaleWhileRevalidate` for `/api/v1/alerts`, `/meta`, `/checklists`; `NetworkFirst` (3 s timeout) for `/sync/manifest`; **do not precache the bundle** (it lives in IndexedDB).
- CSP (set at the host): `connect-src 'self' <api origin>`; `img-src 'self' https: data:`. Decide whether to restrict `https:` further once real image sources are chosen (Q5).
- `external_image_url` is empty for all rows today, so every product shows the SVG fallback. That is correct and expected until an image source is approved.

### 3.8 Frontend tests and gates

- Add `vitest`, `@testing-library/react`, `fake-indexeddb`, `eslint`; `tsc --noEmit` and `eslint` clean (dev plan §5).
- Unit tests: mappers, local search ranking (including `011234` equals `01-1234`), keyset paging, sync transaction (interrupted sync leaves the old catalogue intact), Dexie v1→v2 upgrade removes seed rows and keeps real saved rows.
- Checklist tests: resolver fallback order (variant, then category, then generic five); token filling; client and server resolve identically on a shared fixture; progress persists across reload; PRD FR005 coverage (date-format, foil/tamper seal and print-sharpness points each appear in at least one category).
- **Offline simulation** (Playwright against a built preview): load online, go offline, search and open a result and tick the checklist with zero unhandled promise rejections (PRD verification gate).
- Bundle budget check in CI: fail if the main chunk exceeds 150 KB gzip.

---

## 4. Order of work, size, and checkpoints

| # | Task | Size | Depends on | Checkpoint you will see |
| :-- | :--- | :-- | :--- | :--- |
| P1.1 | Migration 0004 and ETL date capture | S | – | `expires_on` coverage report by source |
| P1.2 | Alert text repair and re-ingest | M | – | 5 sample alerts with clean summaries; 0 boilerplate |
| P1.3 | Alert→product link table (exact reg only) | S | P1.2 | linked-alert count (expected low) |
| P1.4 | `pack_type` derivation in ETL (in migration 0004) | S | P1.1 | `pack_type` coverage by source |
| P1.5 | Checklist model: migration 0005, variants, sourced content, legal read (section 1.6) | M | P1.4 | resolved checklist printed for 8 sample products |
| P1.6 | **Toothpaste/Cosmetic source spike**, then request to NAFDAC (section 1.5) | S spike, then external wait | – | written finding; draft request ready for you to send |
| P1.7 | Toothpaste/Cosmetic ETL (section 1.5; only after a source is authorised) | M | P1.6 outcome | row counts, expiry coverage; **release gate** |
| P2.1 | Backend scaffold, settings, pool, health, CI lint/type | S | – | `/health`, `/ready` green |
| P2.2 | Products, lookup, search, alerts, checklists, meta | M | P1.x, P2.1 | OpenAPI page; sample calls on real data |
| P2.3 | Sync manifest and bundle, ETag | S | P2.2 | bundle KB, `sha256`, 304 on repeat |
| P2.4 | Cache interface and in-memory implementation, rate limit (Redis deferred) | S | P2.2 | cache-hit timings |
| P2.5 | Test suite, contract test, latency gate | M | P2.2–2.4 | p95 printout |
| P3.1 | API client, generated types, repository, mappers | M | P2.2 | `tsc` clean |
| P3.2 | Dexie v2, sync worker, seed removal | M | P2.3, P3.1 | first-sync run on a clean browser profile |
| P3.3 | Screen migrations (table in 3.5) | M | P3.1–3.2 | side-by-side screenshots on real data |
| P3.3a | Dynamic checklist: resolver, progress hook, `ChecklistItem` flag hint (3.5a) | M | P1.5, P2.2, P3.2 | screenshots of 3 products in different categories and pack types |
| P3.3b | Hands-free OCR scan: Tesseract worker, strip capture, pattern and double-read, bubble states, remove fake detection (3.5b) | M | P3.1 (lookup) | recorded run on 8 sample numbers, accuracy and memory figures |
| P3.4 | Frontend tests, offline simulation, bundle and copy gates | M | P3.3, P3.3b | all gates green |

S ≈ under half a day, M ≈ about a day. Phases 1 and 2 can overlap; Phase 3 should not start until the API contract (P2.2) is stable. **P1.6 should start today** because it waits on NAFDAC; P1.7 is the only item whose duration I cannot estimate.

---

## 5. Definition of done

- Every number on every screen traces to the database through the API or a verified sync; no seed data or fallback strings remain.
- `ruff`, `mypy --strict`, `tsc --noEmit`, `eslint` clean; backend and frontend suites pass; contract and parity tests pass.
- `/search` p95 below 300 ms; local search below 50 ms; bundle under 150 KB gzip.
- Offline run: with the network disabled after one sync, search, result, saved and checklist all work with no unhandled rejections.
- The legal copy audit passes; every result screen shows the disclaimer.
- **Release gate (your decision):** Toothpaste and Cosmetic records from an authorised source meet the agreed minimum (Q9). Not met means not released.
- The scanner reads a printed NAFDAC number hands-free and shows it in the "Got it!" bubble; the simulated detection is gone (3.5b).
- The checklist is category- and pack-type-driven, persisted per product, and works offline; no checklist text anywhere tells a user a product is fake.
- `docs/results_2.1-3.5.md` is written from real runs (queries, latency numbers, screenshots), not from assertions.

---

## 6. Risks and known limits

1. **Alert→product links will be sparse.** Most NAFDAC alerts name no registration number, and linking by name is deliberately forbidden. Expect the alert banner, not product badges, to carry most alerts.
2. **No Toothpaste or Cosmetic data, and no public source found (the main schedule risk).** NAPAMS needs a CAPTCHA and a certificate login and the ETL skips it by design; NAFDAC's "Registered Products (non drug) Database" is named on its home page but not linked. You decided launch needs this data, so the release now depends on an answer from NAFDAC, which neither of us controls. Mitigation: start the request now (1.5), and keep every other phase moving. If NAFDAC refuses or stalls, the decision to ship without these categories returns to you, with the honest-coverage wording already built in.
3. **Registration numbers are not unique identifiers.** 15 FoodDB and 36 Greenbook numbers carry several products. Scan results can legitimately be `multiple`; the UI needs a short picker.
4. **Renamed products leave stale rows** until the ETL is run with `--prune`. Make the weekly job run it (roadmap 1.5).
5. **Greenbook `OTC` mapping is inferred** (`marketing_category_id = 2`), not published by the portal. Label it "Over-the-counter (inferred from registry class)" in internal docs; do not present it to users as an official NAFDAC classification.
6. **Free-tier hosting cold starts** can break the "under 300 ms" claim for the first request; the local-first design hides this from users but not from the latency test.
7. **PostgreSQL 18 locally vs 16 in plan**: still open until a host is named (Q1, Q4). Python is settled (3.12).
8. **Checklist content is public safety guidance.** New points need a cited source and a legal read (1.6). Adding variants without that would make the checklist look authoritative when it is not.
9. **`pack_type` will be missing for some Food and Beverage rows** (FoodDB `presentation` is blank or "n/a" on part of the table). Those products get the category default checklist, not a guessed one.

---

## 7. Decisions I need from you

| # | Question | My recommendation |
| :-- | :--- | :--- |
| Q1 | Target PostgreSQL version for hosting: 16 or 18? | **Open.** Decide with the host in Q4; until then keep migrations free of version-specific features. |
| Q2 | Recreate `backend/.venv` on Python 3.12? | **Decided: yes.** |
| Q3 | In-memory caching now, Redis later? | **Decided: Redis later.** |
| Q4 | Hosting for the API and database (Railway, Render, Fly.io)? | **Open** (you said "okay" to my recommendation but named no host). Pick one that offers your chosen Postgres version and lets you disable client-address logging. |
| Q5 | Which image sources are permitted for `external_image_url`? | **Open.** You asked earlier for product images to be fetched from the internet into this column; my recommendation is still to ship V1 on the SVG fallback until licensing and privacy are settled, because every row is empty today. Tell me if you want an image workstream added. |
| Q6 | Show dosage form and pack size on the result screen? | Open, low priority. Optional; skip unless the design needs it. |
| Q7 | Alert badge on products vs banner-only for V1? | **Decided: banner-only is acceptable.** |
| Q8 | Ship without Toothpaste/Cosmetic data? | **Decided: no. Find the data (1.5).** |
| Q9 | What minimum Toothpaste/Cosmetic coverage lets us release? | **Open, new.** I suggest at least 200 records including the major toothpaste brands, all with registration number, status and expiry date. |
| Q10 | Who sends the request to NAFDAC (1.5), and from which address? | **Open, new.** I will draft it; it must come from CheckAm or you, not from me. |
| Q11 | Who signs off new checklist wording (1.6)? | **Open, new.** Needs a source citation per point and a legal read before release. |

---

## 8. What this plan deliberately does not cover

- Barcode (EAN/UPC) scanning with `zxing-wasm`: not needed for NAFDAC numbers (3.5b); a possible later addition. Reading product names by OCR is also out of scope (number only).
- GitHub Actions weekly scrape, retries and failure alerts (roadmap 1.5).
- Lighthouse and low-RAM audit (roadmap 4.1).
- Gazette PDF parsing, NAPAMS, iRIMS.
- Delta sync, an image proxy, accounts, analytics, user reports (excluded by the PRD).
