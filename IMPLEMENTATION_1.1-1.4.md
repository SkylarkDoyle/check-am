# CheckAm Implementation Guide: Roadmap 1.1 to 1.4

Data layer: database, migrations and the three ETL ingesters.

| Roadmap | Deliverable |
|---|---|
| 1.1 | PostgreSQL 16 with `pg_trgm`, Alembic migrations for `products`, `safety_alerts`, `packaging_checklists`, seed for checklists |
| 1.2 | Playwright ETL for NAFDAC Food Products Database and NAPAMS |
| 1.3 | `pdfplumber` parser for NAFDAC Public Alerts and Gazette PDFs into `safety_alerts` |
| 1.4 | `httpx` client for the Greenbook DataTables endpoint (common OTC consumables) |

Source documents: `development_plan.md` (sections 2 and 3) and `product_requirements_document.md` (FR001, FR002, FR007, NFR rules).

**Status of this file.** This is a specification for the coding agent. Nothing in it has been run: no database was provisioned, no portal was contacted, and no rows exist yet. Section 8 lists the exact queries to run once the work is done, so the results can be shown from the real database.

---

## 0. Ground rules and assumptions

1. **Only real, scraped data goes into the database.** Test fixtures use obviously fake values (`TEST-0001`, "Test Product") and live only under `etl/tests/fixtures`, never in the dev or prod database. The brand names used in the design mockups are invented and must not be seeded.
2. **Unknown portal structure is not guessed.** The plan asks for a DOM/XHR inspection first (Immediate Next Step 2). Every selector, URL and request parameter marked `DISCOVER` below must be filled from that inspection and recorded in `etl/config/portals.yaml`. Do not ship placeholder selectors that were never verified.
3. **Be a polite, lawful scraper.** Before any run: read each site's `robots.txt` and terms, identify the client with a descriptive `User-Agent` and a contact address from env, rate-limit (default 1 request per 2 seconds, one connection per host), cache raw responses, stop on repeated 4xx or 5xx, and never bypass a login, CAPTCHA or bot protection. If a portal forbids automated access, stop and report instead of working around it.
4. **No secrets in git.** Database URL, webhook URLs, the contact email and any endpoint URLs live in `.env` (gitignored). Commit `.env.example` only.
5. **Status vocabulary.** The database stores `Active`, `Expired`, `Alert_Flagged`. The app maps them to the three fixed UI verdicts: `Active` is "Official NAFDAC Registry Match", `Expired` or a number with no row is "Registration Lapsed / Not Found in Registry", `Alert_Flagged` (or an active alert row) is "Subject of Official NAFDAC Public Alert". Never store words like "fake" or "genuine".
6. **Deliberate deviation from the plan (one):** `normalized_reg_num` is a `GENERATED ALWAYS ... STORED` column derived from `nafdac_reg_num`, so it can never drift from the formatted number. It stays `VARCHAR(50) NOT NULL` with the B-Tree index the plan asks for. ETL code must not write to it.
7. **Prefix rules in `packaging_checklists.expected_reg_prefix` come from the plan** (`01-`, `08-` Food; `02-` Cosmetics) and must be verified against real scraped numbers before release. The design samples use `A4-` for a toothpaste, which conflicts with the plan's list, so the verification in section 8.9 compares real prefixes to the seeded ones and fails loudly on mismatch.

---

## 1. Repository layout and tooling

```
check-am/
  .env.example
  .gitignore                 # .env, .venv, __pycache__, raw_cache/
  docker-compose.yml         # postgres 16 only (redis comes in 2.2)
  pyproject.toml             # shared tooling config (ruff, mypy, pytest)
  db/
    alembic.ini
    alembic/
      env.py
      versions/
        0001_create_core_tables.py
        0002_seed_packaging_checklists.py
  etl/
    pyproject.toml
    config/portals.yaml      # every DISCOVER value, with the date it was verified
    src/checkam_etl/
      __init__.py
      settings.py            # pydantic-settings, reads .env
      db.py                  # engine + session, upsert helpers
      normalize.py           # reg number and category normalisation
      http.py                # shared httpx client: UA, rate limit, retry, cache
      images.py              # external_image_url resolver and validator
      run_report.py          # RunReport dataclass, JSON log line per run
      sources/
        food_db.py           # 1.2  Playwright, nafdac.gov.ng food database
        napams.py            # 1.2  Playwright, NAPAMS
        alerts_pdf.py        # 1.3  pdfplumber
        greenbook.py         # 1.4  httpx DataTables
      cli.py                 # python -m checkam_etl.cli run --source food_db
    tests/
      fixtures/              # saved HTML, JSON and tiny PDFs (fake data only)
      test_normalize.py
      test_upsert_idempotent.py
      test_food_db_parse.py
      test_alerts_pdf.py
      test_greenbook.py
      test_images.py
```

Tooling (all must pass before any task is marked done, per plan section 5): `ruff check`, `ruff format --check`, `mypy --strict etl/src`, `pytest`.

`pyproject.toml` essentials:

```toml
[tool.ruff]
line-length = 100
target-version = "py312"
[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "S", "ASYNC", "PT"]
[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

Dependencies (pinned in `etl/pyproject.toml`): `sqlalchemy>=2.0`, `psycopg[binary]>=3.2`, `alembic`, `pydantic>=2`, `pydantic-settings`, `httpx`, `playwright`, `pdfplumber`, `tenacity`, `selectolax` or `beautifulsoup4`, `pyyaml`, `pytest`, `pytest-asyncio`, `respx`, `ruff`, `mypy`.

`.env.example`:

```
DATABASE_URL=postgresql+psycopg://checkam:change-me@localhost:5432/checkam
ETL_CONTACT_EMAIL=you@example.com          # goes into the User-Agent
ETL_USER_AGENT=CheckAmETL/0.1 (+mailto:${ETL_CONTACT_EMAIL})
ETL_MIN_DELAY_SECONDS=2
ETL_RAW_CACHE_DIR=./raw_cache
GREENBOOK_ENDPOINT=                        # DISCOVER (task 1.4)
ALERT_WEBHOOK_URL=                         # used from roadmap 1.5
```

---

## 2. Task 1.1: PostgreSQL 16, `pg_trgm`, Alembic

### 2.1 Provision

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: checkam
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      POSTGRES_DB: checkam
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U checkam"]
      interval: 5s
      retries: 10
volumes:
  pgdata:
```

Note: a different local Postgres version may already be running on the developer machine. Use the container (port 5432 conflict: map to `5433:5432` and adjust `DATABASE_URL`) so the schema is verified against **16**, not the host version.

### 2.2 Migration `0001_create_core_tables.py`

Write this with `op.execute` raw SQL so the generated column, constraints and indexes are exact.

```python
"""create products, safety_alerts, packaging_checklists"""
from alembic import op

revision = "0001"
down_revision = None

def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.execute("""
    CREATE TABLE products (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nafdac_reg_num      VARCHAR(50)  NOT NULL UNIQUE,
        normalized_reg_num  VARCHAR(50)  GENERATED ALWAYS AS
            (upper(regexp_replace(nafdac_reg_num, '[^A-Za-z0-9]', '', 'g'))) STORED NOT NULL,
        product_name        VARCHAR(255) NOT NULL,
        brand_name          VARCHAR(150),
        category            VARCHAR(50)  NOT NULL,
        manufacturer        VARCHAR(255) NOT NULL,
        status              VARCHAR(30)  NOT NULL DEFAULT 'Active',
        external_image_url  TEXT,
        source_portal       VARCHAR(50)  NOT NULL,
        last_synced_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT ck_products_status
            CHECK (status IN ('Active','Expired','Alert_Flagged')),
        CONSTRAINT ck_products_category
            CHECK (category IN ('Food','Beverage','Toothpaste','Cosmetic','OTC')),
        CONSTRAINT ck_products_source
            CHECK (source_portal IN ('FoodDB','NAPAMS','Greenbook','Gazette')),
        CONSTRAINT ck_products_image_https
            CHECK (external_image_url IS NULL OR external_image_url ~* '^https://')
    )""")
    op.execute("CREATE INDEX idx_products_norm_reg ON products (normalized_reg_num)")
    op.execute("CREATE INDEX idx_products_name_trgm ON products USING GIN (product_name gin_trgm_ops)")
    op.execute("CREATE INDEX idx_products_category ON products (category)")

    op.execute("""
    CREATE TABLE safety_alerts (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        alert_reference_no  VARCHAR(100) NOT NULL UNIQUE,
        nafdac_reg_num      VARCHAR(50)
            REFERENCES products (nafdac_reg_num) ON DELETE SET NULL,
        product_name        VARCHAR(255) NOT NULL,
        batch_numbers       VARCHAR(255),
        summary             TEXT NOT NULL,
        official_source_url TEXT NOT NULL,
        issued_date         DATE NOT NULL,
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    op.execute("CREATE INDEX idx_alerts_active_date ON safety_alerts (is_active, issued_date DESC)")
    op.execute("CREATE INDEX idx_alerts_reg ON safety_alerts (nafdac_reg_num)")

    op.execute("""
    CREATE TABLE packaging_checklists (
        category            VARCHAR(50) PRIMARY KEY,
        inspection_points   JSONB       NOT NULL,
        expected_reg_prefix VARCHAR(50) NOT NULL,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")

def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS packaging_checklists")
    op.execute("DROP TABLE IF EXISTS safety_alerts")
    op.execute("DROP TABLE IF EXISTS products")
```

Notes for the agent:
- `external_image_url` is nullable `TEXT` and must be `https://` only (the CHECK enforces it; the PWA is served over HTTPS and blocks mixed content).
- `safety_alerts.nafdac_reg_num` references a UNIQUE column, which Postgres allows.
- The plan's ERD shows `created_at` on `safety_alerts`; the table list omits it. It is included here.
- Do not add other columns without updating the plan.

### 2.3 Migration `0002_seed_packaging_checklists.py`

One row per category (`Food`, `Beverage`, `Toothpaste`, `Cosmetic`, `OTC`), idempotent:

```sql
INSERT INTO packaging_checklists (category, inspection_points, expected_reg_prefix)
VALUES (:category, CAST(:points AS jsonb), :prefix)
ON CONFLICT (category) DO UPDATE
SET inspection_points = EXCLUDED.inspection_points,
    expected_reg_prefix = EXCLUDED.expected_reg_prefix,
    updated_at = now();
```

Inspection points use the shape from the plan: `[{"label": "...", "detail": "..."}]`. Suggested common points for every category (add category-specific ones):

| label | detail |
|---|---|
| NAFDAC number on the pack | Printed clearly, matches the registry record. |
| Seal intact | No gaps, glue marks or re-taping. |
| Spelling and print quality | Brand and maker names read correctly, no smudging. |
| Expiry date format | One consistent style, for example 06/2027. |
| Batch and manufacture date | Present, printed the same way as the expiry date. |

`expected_reg_prefix` values come from the plan (see ground rule 7) and are placeholders until section 8.9 passes.

### 2.4 Run

```
docker compose up -d db
cd db && alembic upgrade head
alembic downgrade base && alembic upgrade head     # must succeed (reversible)
```

Done when: both migrations apply on a clean 16.x container, `downgrade base` then `upgrade head` works, and the section 8.1 to 8.3 queries return the expected structure.

---

## 3. Shared ETL building blocks

### 3.1 Normalisation (`normalize.py`)

```python
import re
_REG_STRIP = re.compile(r"[^A-Za-z0-9]")

def normalize_reg(value: str) -> str:
    """Mirror of the SQL generated column. Used only for lookups and tests."""
    return _REG_STRIP.sub("", value).upper()

def clean_reg_display(value: str) -> str:
    """Trim, collapse whitespace, replace en/em dashes with '-', uppercase letters."""
```

Rules: never invent a number; reject rows whose cleaned number is empty or longer than 50 characters and count them as `rejected` in the run report. Unit-test with `"01-4582"`, `" 01 4582 "`, `"A4–5678"` (en dash), lowercase prefixes.

Category mapping: map each portal's category labels to exactly `Food`, `Beverage`, `Toothpaste`, `Cosmetic`, `OTC` in a dict in `portals.yaml`. Unmapped labels are **skipped and counted** (`skipped_category`), not guessed.

### 3.2 Idempotent upsert (`db.py`)

The plan requires `ON CONFLICT (nafdac_reg_num) DO UPDATE`. Update more than status so renames and image links refresh, but never wipe good data with nulls:

```sql
INSERT INTO products
  (nafdac_reg_num, product_name, brand_name, category, manufacturer,
   status, external_image_url, source_portal, last_synced_at)
VALUES (:reg, :name, :brand, :cat, :mfr, :status, :img, :src, now())
ON CONFLICT (nafdac_reg_num) DO UPDATE SET
  product_name       = EXCLUDED.product_name,
  brand_name         = COALESCE(EXCLUDED.brand_name, products.brand_name),
  category           = EXCLUDED.category,
  manufacturer       = EXCLUDED.manufacturer,
  status             = CASE WHEN products.status = 'Alert_Flagged'
                            AND EXCLUDED.status = 'Active'
                            THEN products.status ELSE EXCLUDED.status END,
  external_image_url = COALESCE(EXCLUDED.external_image_url, products.external_image_url),
  source_portal      = EXCLUDED.source_portal,
  last_synced_at     = now()
RETURNING (xmax = 0) AS inserted;
```

- The `status` rule stops a routine registry sync from clearing an `Alert_Flagged` set by task 1.3. Only task 1.3 (when the alert becomes inactive) may move a product back from `Alert_Flagged`.
- Use `executemany`/batched `INSERT ... VALUES` with batches of 500, in one transaction per batch.
- `RETURNING (xmax = 0)` distinguishes inserts from updates for the run report.

### 3.3 Run report (`run_report.py`)

Every source run ends by printing one JSON line and writing it to a log file:

```json
{"source":"food_db","started":"...","finished":"...","fetched":0,"parsed":0,
 "inserted":0,"updated":0,"rejected":0,"skipped_category":0,"images_set":0,"errors":[]}
```

The values come from the real run. Exit code is non-zero if `errors` is non-empty or `parsed` is 0.

### 3.4 HTTP client (`http.py`)

One shared `httpx.AsyncClient`: timeout 30s, `User-Agent` from settings, a per-host async rate limiter honouring `ETL_MIN_DELAY_SECONDS`, `tenacity` retry (3 attempts, exponential 2s to 30s, only on timeouts, connection errors, 429 and 5xx), and an on-disk raw cache keyed by URL hash under `ETL_RAW_CACHE_DIR` so parser bugs can be fixed without hitting the portal again.

---

## 4. Task 1.2: Food Products Database and NAPAMS (Playwright)

Files: `sources/food_db.py`, `sources/napams.py`, `config/portals.yaml`.

### 4.1 Discovery (do first, record in `portals.yaml`)

For each portal capture, with the date: entry URL, whether data comes from the rendered table or from an XHR/JSON call (prefer the JSON call if it is a normal public request the page itself makes), pagination mechanism and selectors, page size options, column order, how registration status and expiry are shown, whether product images or barcodes appear, the robots.txt result and any terms that restrict automated access.

```yaml
food_db:
  verified_on: DISCOVER
  url: https://www.nafdac.gov.ng/food-products-database/
  mode: DISCOVER            # table | xhr
  selectors:
    table_rows: DISCOVER
    next_button: DISCOVER
    columns: DISCOVER       # name -> column index
  category_map: {}          # portal label -> Food|Beverage|Toothpaste|Cosmetic|OTC
napams:
  verified_on: DISCOVER
  url: https://registration.nafdac.gov.ng/
  mode: DISCOVER
  login_required: DISCOVER  # if true: stop and report, do not automate
```

### 4.2 Scraper behaviour

- Playwright async API, Chromium headless, a single page, `wait_until="networkidle"` only where needed, explicit `wait_for_selector` on the table rows.
- Page through results until the portal's last page; stop after 3 consecutive empty pages. Store each page's HTML (or JSON) in the raw cache.
- Parse into a `ProductRow` Pydantic model: `nafdac_reg_num`, `product_name`, `brand_name`, `category`, `manufacturer`, `registration_date`, `expiry_date`, `image_url` (if the portal exposes one), `source_portal`.
- **Status from expiry:** `Active` if `expiry_date` is missing-but-listed-as-registered or `expiry_date >= today` (Africa/Lagos); `Expired` if the date has passed. Use the portal's own wording where it states a status. Do not infer anything else.
- Category filtering for the MVP: keep only the categories in `category_map`.
- NAPAMS only after Food DB works. If NAPAMS needs credentials or a CAPTCHA, do not automate it; document it in `portals.yaml` and the run report.
- Goal from the plan: at least **500 verified food, beverage and toothpaste records** after the first local run.

### 4.3 `external_image_url` (images fetched from the internet)

The database stores **only a link** (PRD: no hosted binaries). Resolution order in `images.py`, stopping at the first valid URL:

1. An image URL exposed by the portal row itself (if any).
2. A manufacturer or retailer product page found via a configured search source.
3. A public product database that publishes a product image (for example Open Food Facts for barcoded foods). **Check each source's licence and hotlinking policy first**, record the source and attribution requirement in `portals.yaml`, and only use sources that allow it.

Validation for every candidate URL before it is written:
- Scheme must be `https`; reject credentials in the URL, `data:` and `javascript:` URLs, and anything over 2,048 characters.
- **SSRF guard:** resolve the host and reject private, loopback, link-local and reserved addresses; follow at most 3 redirects and re-check each hop.
- `HEAD` (fall back to a ranged `GET`): status 200, `Content-Type` in `image/jpeg`, `image/png`, `image/webp`, and `Content-Length` at most 1.5 MB when present.
- Never download or store the image bytes. Never write a URL that failed validation; leave `external_image_url` NULL.
- Respect the same rate limit; run image resolution as a separate pass (`cli run --source images`) so a slow image host never blocks registry ingestion.
- Re-validate stored URLs on each weekly run; set a link to NULL after 2 consecutive failures (track failures in the run report, not in a new column, unless a column is approved).

Why this matters to the product: the PWA shows the SVG pack placeholder when `external_image_url` is NULL or the image fails to load (`onError`), so NULL is always safe.

Two product-level notes to confirm with the owner before launch:
- **Licensing:** hotlinked photos belong to their owners. Only link where use is permitted, and keep source attribution.
- **Privacy:** loading a third-party image sends the user's IP address to that host, which sits awkwardly with "your data stays on your phone". Options: show the image only after an explicit tap, or proxy through a Cloudflare Worker that strips headers (this adds a hosted component, so it needs a decision).

### 4.4 Tests

- `test_food_db_parse.py`: parse a saved HTML fixture into `ProductRow`s; assert counts, normalisation, status from expiry (freeze time), unmapped category skipped.
- `test_upsert_idempotent.py` (uses a temporary Postgres 16 via testcontainers or the compose db on a test schema): run the same fixture twice; assert row count unchanged, `inserted` is 0 on the second run, `last_synced_at` advanced, and an existing non-null `external_image_url` is not overwritten by NULL.

---

## 5. Task 1.3: Public Alerts and Gazette PDFs (`pdfplumber`)

File: `sources/alerts_pdf.py`.

### 5.1 Discovery

Record in `portals.yaml`: the index page(s) listing NAFDAC public alerts and Gazette publications, how PDF links are exposed, naming patterns, and the layout of a sample alert (title block, reference number format, date format, product and batch lines). Use the plan's example format `Alert No. 042/2026` only as a starting regex; confirm against real documents.

### 5.2 Pipeline

1. Fetch the index through the shared HTTP client; collect PDF URLs not yet processed (track processed URLs in the run report and, if needed, by `official_source_url` already present in `safety_alerts`).
2. Download each PDF to the raw cache (size limit 20 MB, `Content-Type: application/pdf`).
3. `pdfplumber` text extraction per page; keep the page number for debugging. If a PDF has no text layer, log `needs_ocr` and skip it. Do not guess.
4. Parse with explicit, unit-tested regexes:
   - `alert_reference_no`: for example `(?i)alert\s*no\.?\s*([0-9]{1,4}\s*/\s*20[0-9]{2})`, normalised to `Alert No. 042/2026`.
   - `issued_date`: parse the document's own date; reject if missing (do not default to today).
   - `product_name`, `batch_numbers`: from labelled lines.
   - `nafdac_reg_num`: any number matching the registry format found in the alert body, validated against `products.normalized_reg_num` so the foreign key only points to a real product.
   - `summary`: a concise factual excerpt of the notice text. **Quote or lightly trim the official wording; never add adjectives or advice.** Store `official_source_url` as the PDF's own `nafdac.gov.ng` URL.
5. Upsert:
   ```sql
   INSERT INTO safety_alerts (alert_reference_no, nafdac_reg_num, product_name,
       batch_numbers, summary, official_source_url, issued_date, is_active)
   VALUES (...)
   ON CONFLICT (alert_reference_no) DO UPDATE SET
       nafdac_reg_num = COALESCE(EXCLUDED.nafdac_reg_num, safety_alerts.nafdac_reg_num),
       product_name = EXCLUDED.product_name, batch_numbers = EXCLUDED.batch_numbers,
       summary = EXCLUDED.summary, official_source_url = EXCLUDED.official_source_url,
       issued_date = EXCLUDED.issued_date;
   ```
6. **Flag products:** for every active alert with a matched `nafdac_reg_num`, set `products.status = 'Alert_Flagged'`. When an alert becomes inactive and no other active alert references the product, restore the status from the product's expiry (`Active` or `Expired`) using the stored registry data; this is the only code path allowed to leave `Alert_Flagged`.
7. `is_active`: true by default. Set false only when the source states the alert is withdrawn or superseded; never by age alone.

Alerts with no matching registry number are still stored (`nafdac_reg_num` NULL) because unregistered products are alert subjects too.

### 5.3 Tests

`test_alerts_pdf.py` with small fake PDFs generated in the test (reportlab or a saved fixture): reference number variants, missing date rejected, non-text PDF skipped, matched vs unmatched registry numbers, idempotent second run, flag then unflag flow.

Goal from the plan: active 2026 public alerts loaded alongside the 500 seed products.

---

## 6. Task 1.4: Greenbook DataTables client (`httpx`)

File: `sources/greenbook.py`. (Backlog in the plan; implement after 1.2 and 1.3 are verified.)

### 6.1 Discovery

From DevTools on the Greenbook site capture the exact XHR: URL (store as `GREENBOOK_ENDPOINT`), method, headers that are actually required, the DataTables server-side parameters, and the JSON keys. Record all of it in `portals.yaml`. Do not call the endpoint with guessed parameters.

### 6.2 Client behaviour

Standard jQuery DataTables server-side protocol:

- Request: `draw`, `start`, `length`, `search[value]`, `order[0][column]`, `order[0][dir]`, and the `columns[i][data]` entries the endpoint expects.
- Response: `{"draw": n, "recordsTotal": n, "recordsFiltered": n, "data": [...]}`.
- Page with `length=100`, increasing `start` until `start >= recordsFiltered`. Stop if a page returns no rows. Use the shared rate-limited client and retry policy; abort the run after 5 consecutive failures.
- **Filter for common OTC consumables:** keep a keyword or product-class allow-list in `portals.yaml` (for example analgesics, antimalarials, cough and cold, vitamins, antacids, oral rehydration). Map every kept row to `category = 'OTC'` and `source_portal = 'Greenbook'`. Rows outside the allow-list are counted as `skipped_category`.
- Reuse `ProductRow`, `clean_reg_display`, the status-from-expiry rule and the shared upsert. Image links follow section 4.3.
- Where a Greenbook record duplicates a Food DB number, the unique `nafdac_reg_num` keeps one row; `source_portal` records the latest source.

### 6.3 Tests

`test_greenbook.py` with `respx`: multi-page pagination, empty page stop, 429 then success retry, five-failure abort, allow-list filtering, schema validation errors reported without crashing.

---

## 7. CLI and local run order

```
python -m checkam_etl.cli run --source food_db       # 1.2
python -m checkam_etl.cli run --source napams        # 1.2 (only if automation is permitted)
python -m checkam_etl.cli run --source alerts_pdf    # 1.3
python -m checkam_etl.cli run --source greenbook     # 1.4
python -m checkam_etl.cli run --source images        # external_image_url pass
python -m checkam_etl.cli run --all                  # runs the above in this order
```

Order matters: registry rows first, then alerts (they flag products), then images. Each command prints its run-report JSON and exits non-zero on failure. GitHub Actions scheduling and failure alerts are roadmap 1.5 and are out of scope here.

---

## 8. Database verification (the results to show)

Run these against the real database after the four tasks and paste the output. Each query states what a passing result looks like. Numbers are never assumed in advance.

**8.1 Extension and tables exist**
```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('products','safety_alerts','packaging_checklists');
SELECT version();
```
Pass: `pg_trgm` listed, three tables, version string starts with `PostgreSQL 16`.

**8.2 Columns and constraints**
```sql
SELECT column_name, data_type, is_nullable, column_default, is_generated
  FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid IN ('products'::regclass,'safety_alerts'::regclass);
```
Pass: `external_image_url` is `text`, nullable; `normalized_reg_num` shows `is_generated = ALWAYS`.

**8.3 Indexes**
```sql
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename IN ('products','safety_alerts') ORDER BY tablename, indexname;
```
Pass: `idx_products_norm_reg`, `idx_products_name_trgm` (GIN, `gin_trgm_ops`), `idx_products_category`.

**8.4 Counts by source, status and category**
```sql
SELECT source_portal, status, count(*) FROM products GROUP BY 1,2 ORDER BY 1,2;
SELECT category, count(*) FROM products GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS total FROM products;
```
Pass: total is at least the plan's 500 seed target across food, beverage and toothpaste.

**8.5 Sample rows (real data only)**
```sql
SELECT nafdac_reg_num, normalized_reg_num, product_name, category, manufacturer,
       status, external_image_url, source_portal, last_synced_at
  FROM products ORDER BY last_synced_at DESC LIMIT 15;
```

**8.6 `external_image_url` coverage and sanity**
```sql
SELECT count(*) FILTER (WHERE external_image_url IS NOT NULL) AS with_image,
       count(*) FILTER (WHERE external_image_url IS NULL)     AS without_image,
       round(100.0 * count(*) FILTER (WHERE external_image_url IS NOT NULL) / count(*), 1) AS pct
  FROM products;
SELECT split_part(external_image_url, '/', 3) AS host, count(*)
  FROM products WHERE external_image_url IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
SELECT count(*) AS non_https FROM products
 WHERE external_image_url IS NOT NULL AND external_image_url !~* '^https://';
```
Pass: `non_https` is 0. Report the coverage honestly; NULL is acceptable and handled by the app's SVG fallback.

**8.7 Alerts**
```sql
SELECT alert_reference_no, nafdac_reg_num, product_name, batch_numbers, issued_date, is_active, official_source_url
  FROM safety_alerts ORDER BY issued_date DESC LIMIT 15;
SELECT count(*) FILTER (WHERE is_active) AS active, count(*) AS total FROM safety_alerts;
SELECT p.nafdac_reg_num, p.status, a.alert_reference_no
  FROM products p JOIN safety_alerts a ON a.nafdac_reg_num = p.nafdac_reg_num
 WHERE a.is_active;
```
Pass: every product joined to an active alert has `status = 'Alert_Flagged'`.

**8.8 Packaging checklists**
```sql
SELECT category, expected_reg_prefix, jsonb_array_length(inspection_points) AS points
  FROM packaging_checklists ORDER BY category;
```
Pass: five rows.

**8.9 Prefix check (ground rule 7)**
```sql
SELECT c.category, c.expected_reg_prefix,
       count(*) AS products,
       count(*) FILTER (WHERE p.nafdac_reg_num LIKE c.expected_reg_prefix || '%') AS matching
  FROM packaging_checklists c JOIN products p ON p.category = c.category
 GROUP BY 1,2 ORDER BY 1;
```
Pass: `matching` is close to `products` for each category. Large gaps mean the seeded prefix is wrong; fix the seed from real data and say so.

**8.10 Fuzzy search works and uses the index**
```sql
SET pg_trgm.similarity_threshold = 0.3;
EXPLAIN (ANALYZE, BUFFERS)
SELECT nafdac_reg_num, product_name, similarity(product_name, :probe) AS s
  FROM products WHERE product_name % :probe ORDER BY s DESC LIMIT 10;
```
Use a real product name from 8.5 with one typo as `:probe`. Pass: plan shows a bitmap index scan on `idx_products_name_trgm` once the table is large enough, and execution time is well under 100 ms (plan target: sub-100 ms).

**8.11 Idempotency (plan section 5)**
```sql
-- before and after a repeated run of the same source
SELECT count(*) FROM products;
SELECT count(*) FROM (SELECT nafdac_reg_num FROM products GROUP BY 1 HAVING count(*)>1) d;
```
Pass: the count is unchanged after a second run and the duplicate query returns 0.

### Results report template

Create `docs/results_1.1-1.4.md` filled from the real outputs of 8.1 to 8.11, plus the four `RunReport` JSON lines, the date, the Postgres version, and a list of anything skipped (for example a portal that required login). Do not include invented rows.

---

## 9. Definition of done (maps to plan section 5)

- `ruff`, `mypy --strict` and `pytest` pass with zero errors; no secrets in git.
- Migrations reversible and applied on Postgres 16.
- ETL upserts proven idempotent by test and by 8.11.
- `/etl` can ingest at least 500 real food, beverage and toothpaste products and the active 2026 alerts locally, or the report states exactly why not.
- Every `external_image_url` is `https`, validated, and never a stored binary.
- All eleven verification queries run and their real output is saved in the results report.

## 10. Open questions for the owner

1. Do the portals' terms allow automated access? If not, is there an official data export or partnership route?
2. Which public sources are approved for product images, and is hotlinking acceptable under their terms?
3. Should third-party images load only after a tap to protect user IP addresses, or is a proxy acceptable?
4. Confirm the registration prefix rules per category (the plan's values conflict with some sample numbers used in the design).
5. Should `Expired` products stay in the offline bundle (so the app can say "lapsed") or only be queryable online?


---

## Addendum (2026-11-21): changes made during execution

- Migration `0003` replaces `UNIQUE(nafdac_reg_num)` with a unique index on `(nafdac_reg_num, lower(btrim(product_name)))` and drops the
  `safety_alerts` FK, because portals reuse a registration number for several products. Upserts now use that conflict target.
- Greenbook OTC selection uses the portal's `marketing_category_id` (config in `portals.yaml`), not a keyword allow-list.
- HTTP cache key includes query params and expires after `ETL_CACHE_TTL_HOURS` (default 24); `run --no-cache` and `run --prune` added.
- See `docs/results_1.1-1.4.md` for the verified results.
