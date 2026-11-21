# CheckAm

**Check the NAFDAC registration of packaged food, drinks and over-the-counter medicines, fast, even offline.**

CheckAm is an offline-first Progressive Web App for Nigerian shoppers. It looks up a product's NAFDAC registration number or name, shows what the public NAFDAC registry says about it, and walks you through a short packaging checklist. The data comes from NAFDAC's public portals, collected by an automated pipeline and served through a free, open JSON API.

> **Important:** CheckAm reports what the NAFDAC public registry shows. It does **not** decide whether a product is genuine, and it never labels a product "fake" or "counterfeit". Inspect the pack yourself and contact NAFDAC for enforcement. CheckAm is an independent project and is **not affiliated with or endorsed by NAFDAC**.

- **Live API:** `https://checkam-api.fastapicloud.dev` (interactive docs at [`/docs`](https://checkam-api.fastapicloud.dev/docs))
- **Status:** MVP in progress. About 3,600 products and 14 NAFDAC public alerts are loaded.

---

## Contents

- [Public API](#public-api)
- [Architecture](#architecture)
- [Data and coverage](#data-and-coverage)
- [Run it locally](#run-it-locally)
- [Docker](#docker)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [Responsible use and legal](#responsible-use-and-legal)

---

## Public API

Base URL: `https://checkam-api.fastapicloud.dev/api/v1`

- Read-only JSON over HTTPS. **No API key, no accounts.** CORS is restricted to the CheckAm web app, so browser apps on other origins cannot call it directly. Server-side and command-line use works.
- Be kind: cache responses and do not hammer it. `/search` is rate-limited to 60 requests per minute per IP, and heavier use may be limited further.
- The service runs on a free tier that **scales to zero**. The first request after a quiet period can take a few seconds. There is no uptime guarantee.
- Unprefixed aliases exist (for example `/search`), but `/api/v1/...` is the stable path.

### Endpoints

| Method and path | What it does |
|---|---|
| `GET /search?q=&category=&limit=` | Search by NAFDAC number, product name, or manufacturer. `q` is 2 to 80 characters. `category` is `Food`, `Drinks`, `Care` or `Meds`. `limit` is 1 to 50 (default 20). |
| `GET /products/lookup?reg=` | Exact lookup by registration number, for example `A8-9775`. Punctuation and case are ignored. |
| `GET /products/{id}` | One product with its safety alerts and packaging checklist. |
| `GET /products?category=&limit=&cursor=` | Paged product feed. `limit` is 1 to 50 (default 10). Use `next_cursor` to continue. |
| `GET /alerts?active=&limit=` | Official NAFDAC public safety alerts. `active` defaults to `true`. |
| `GET /alerts/{id}` | One alert. |
| `GET /checklists` | All packaging checklists. |
| `GET /checklists/resolve?category=&pack_type=&reg_number=` | The checklist points that apply to a product type. |
| `GET /meta` | Disclaimer, coverage, counts and the last sync time. |
| `GET /sync/manifest` | Version, counts, size and SHA-256 of the offline bundle. |
| `GET /sync-bundle` | The full dataset as one gzipped JSON file, with ETag support (`If-None-Match`). The PWA uses this for offline search. |
| `GET /health`, `GET /ready` | Liveness, and readiness including the database. |

### Status values

Registry state is reported with neutral words:

| `status` | Meaning |
|---|---|
| `match` | The registry lists the number as active. |
| `lapsed` | The registration has expired. |
| `alert` | The product is named in an official NAFDAC alert. |
| `not_found` (lookup only) | No record in the data CheckAm holds. This does not by itself mean the product is unsafe. |

`lookup` returns `result: "match"`, `"multiple"` or `"not_found"`. Several different products can share one registration number, which is why `multiple` exists.

### Examples

Search:

```bash
curl "https://checkam-api.fastapicloud.dev/api/v1/search?q=milo&limit=3"
```

Look up a registration number:

```bash
curl "https://checkam-api.fastapicloud.dev/api/v1/products/lookup?reg=A8-9775"
```

```json
{
  "result": "match",
  "products": [
    {
      "reg_number": "A8-9775",
      "reg_normalized": "A89775",
      "name": "Milo 3 in 1 Milky and Creamy (Milk; Malt & Cocoa) Energy Food Drink",
      "category": "Drinks",
      "manufacturer": "Nestle Nigeria Plc. Agbara Factory",
      "status": "match",
      "registered_on": "2022-09-29",
      "source": "FoodDB"
    }
  ]
}
```

(Fields are shortened here. The real response has more, including `id`, `pack_type`, `pack_size`, `expires_on`, `image_url` and `last_synced_at`.)

Errors use one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Download the whole dataset:

```bash
curl -H "Accept-Encoding: gzip" -o checkam.json.gz https://checkam-api.fastapicloud.dev/api/v1/sync-bundle
```

---

## Architecture

```
NAFDAC public portals ──► ETL (Python) ──► PostgreSQL (Neon) ──► FastAPI ──► PWA (React, offline-first)
 Food DB, Greenbook,       Playwright,       products, alerts,     /api/v1      Dexie/IndexedDB local copy,
 public alerts PDFs        httpx, pdfplumber checklists            search,      instant search, on-device
                                                                   sync bundle  OCR for the NAFDAC number
```

| Part | Tech |
|---|---|
| Frontend (`frontend/`) | React, TypeScript, Vite, Tailwind, Dexie (IndexedDB), `vite-plugin-pwa`, Tesseract.js |
| API (`backend/`) | FastAPI, Pydantic v2, psycopg 3 async pool, raw SQL, `pg_trgm` fuzzy search, ETag sync bundle |
| ETL (`etl/`) | Python, Playwright, httpx, pdfplumber, tenacity, idempotent upserts |
| Database (`db/`) | PostgreSQL 18 with Alembic migrations (hosted on Neon) |

How it behaves:

- **Offline first.** The PWA downloads one gzipped bundle (about 260 KB) and answers searches on the phone. The API is only needed to sync and for fallback search.
- **Hands-free scan.** The camera reads the NAFDAC number on the pack on the device. No photo is uploaded.
- **Private by design.** No accounts, no location, no analytics identifiers.

---

## Data and coverage

CheckAm collects public records from NAFDAC's public portals:

| Source | Content |
|---|---|
| Food Products Database | Registered food and drink products |
| Greenbook | Registered medicines (CheckAm keeps the over-the-counter selection) |
| Public alerts | Official recalls and public safety alerts |

Known limits:

- **Categories today:** Food, Drinks and Meds (OTC). Toothpaste and cosmetics (the `Care` category) are not loaded yet because no public bulk source has been found.
- **Food database dates:** it covers products registered in roughly 2022 to 2025.
- **NAPAMS:** skipped. The portal uses a CAPTCHA, and CheckAm does not bypass those.
- **Shared numbers:** some registration numbers belong to more than one product, so the API can return several matches.
- **Freshness:** data is as of the last ETL run (`/meta` has the time). A missing product may simply not be in the data yet.

The ETL is polite: it identifies itself with a User-Agent, waits between requests, caches responses, and never bypasses CAPTCHAs or logins.

---

## Run it locally

You need Python 3.12, Node 22 with pnpm, and a PostgreSQL database (or use [Docker](#docker)).

```bash
cp .env.example .env        # then edit the values; .env is gitignored
```

**1. Database schema**

```bash
cd db
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/checkam alembic upgrade head
```

**2. Load data (ETL)**

```bash
cd etl
pip install -e .
playwright install chromium
python -m checkam_etl.cli run --source food_db
python -m checkam_etl.cli run --source greenbook
python -m checkam_etl.cli run --source alerts_pdf
```

Useful flags: `--limit N`, `--no-cache`, `--prune`, and `--target neon` (writes to `NEON_DIRECT_URL` instead of the local database).

**3. API**

```bash
cd backend
uv sync --extra dev
uv run uvicorn app.main:app --reload        # Linux and macOS
python run_server.py                        # Windows (needs a selector event loop)
```

Open `http://127.0.0.1:8000/docs`.

**4. Frontend**

```bash
cd frontend
pnpm install
pnpm dev
```

The dev server runs on `http://localhost:5173` and proxies `/api` to the API on port 8000.

**Tests**

```bash
cd backend && uv run pytest        # needs DATABASE_URL pointing at a loaded database
pytest                              # ETL tests, run from the repository root
```

---

## Docker

```bash
docker compose up --build
```

This starts PostgreSQL 18, runs the migrations, then starts the API on `http://localhost:8000` and the web app on `http://localhost:8080`. The ETL runs on demand:

```bash
docker compose run --rm etl run --source food_db
```

Set `POSTGRES_PASSWORD` in `.env` first, using letters and digits only, because it goes into connection URLs. The compose database starts empty. See [docker-compose.yml](docker-compose.yml) for ports and options.

---

## Deployment

The MVP runs on free tiers:

| Piece | Where |
|---|---|
| API | FastAPI Cloud, deployed from `backend/` with `fastapi cloud deploy` |
| Database | Neon Postgres |
| PWA | Cloudflare Pages (static build, no Docker) |
| ETL | Docker image run by a scheduled job or locally |

Secrets (database URLs, tokens) live in `.env` locally and in each host's secret store in production. They are never committed. Set `VITE_API_BASE_URL` at PWA build time to point at the API, and add the PWA's origin to the API's `CORS_ORIGINS`.

---

## Project layout

```
backend/    FastAPI service (app/, tests/, Dockerfile)
etl/        Ingestion pipeline (src/, config/portals.yaml, Dockerfile)
db/         Alembic migrations
frontend/   React PWA (src/, public/, Dockerfile, nginx.conf for the Docker image)
docs/       Implementation results
scripts/    One-off inspection helpers
docker-compose.yml
product_requirements_document.md   Product requirements
development_plan.md                Technical plan
DESIGN_SYSTEM.md                   UI design system
```

---

## Contributing

Issues and pull requests are welcome. Good first areas: a lawful public source for toothpaste and cosmetics, the ETL parsers, accessibility, and translations.

Please keep these rules, which come from the product requirements:

- Use neutral wording. Never call a product "fake" or "counterfeit".
- Scrape lawfully and politely: respect `robots.txt`, rate-limit, and never bypass CAPTCHAs or logins.
- No accounts and no personal data collection.
- Never commit secrets, `.env` files or database dumps.

---

## Responsible use and legal

- **Not affiliated with NAFDAC.** Data is gathered from publicly available NAFDAC pages. NAFDAC remains the authority on product registration.
- **No guarantee.** Records can be incomplete, delayed or wrong. Do not rely on CheckAm alone for health decisions. To report a suspicious product, contact NAFDAC.
- **API use.** The API is offered as-is for personal, research and app use, with no warranty. Credit CheckAm and link back to the official NAFDAC source when you republish its data.
- **License.** No license has been chosen yet, so all rights are reserved until one is added.
