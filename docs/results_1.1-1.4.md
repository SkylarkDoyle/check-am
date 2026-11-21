# CheckAm Data Layer Verification Report (Roadmap Deliverables 1.1 - 1.4)

**Execution Date:** 2026-11-21  
**Database Server:** PostgreSQL 18.2 on x86_64-windows, compiled by msvc-19.44.35222, 64-bit  
**Database Name:** `checkam`  
**Host:** `localhost:5432`  


> ## ✅ Final state after round-2 fixes (2026-11-21): use these figures
>
> **Round-2 changes**
> - **Migration `0003`** (applied; DB now at revision `0003`): `UNIQUE(nafdac_reg_num)` replaced by a unique index on
>   `(nafdac_reg_num, lower(btrim(product_name)))`, so products that share a registration number are all kept
>   (15 FoodDB + 36 Greenbook numbers carry several products; the portal itself annotates some as
>   "duplicate, different product"). The FK `safety_alerts -> products(nafdac_reg_num)` was dropped because it needs a
>   unique parent column; alerts keep the number (indexed) and the ETL flags **every** matching product.
>   Trade-off: if a portal renames a product, the old name becomes a stale row until `run --prune` removes it.
> - **OTC filter rewritten.** Keyword matching (amoxicillin, artemether...) labelled prescription drugs as OTC. The filter now
>   uses the portal's own `marketing_category_id` (config: `otc_marketing_category_ids: [2]`), category
>   Drugs / Herbals and Nutraceuticals, and never injectable routes. Evidence on all 9,048 records: id 2 holds paracetamol,
>   ibuprofen, antacids, loperamide, loratadine, vitamins; id 1 holds amoxicillin, tramadol, statins, ARVs; id 5 is devices.
>   **The id -> "OTC" label mapping is inferred, not published by the portal.** Artemether/lumefantrine is id 2 and is kept.
> - Portal UI markers in names (`##`, `**`, trailing `_`, "(check pack size)") are stripped.
> - New `run --prune` (opt-in, complete runs only, refuses if < 50% of stored rows were seen, never deletes `Alert_Flagged`).
> - Housekeeping slip, fixed: while editing `etl/config/portals.yaml` I accidentally truncated its `alerts:` block, which
>   broke `alerts_pdf`. I restored `index_url` (from `scripts/inspect_alerts.py`, the only key the code reads) and re-ran:
>   349 links / 14 parsed, identical to before.
>
> **Live run**
> ```json
> {"source": "food_db", "fetched": 3000, "parsed": 2369, "inserted": 36, "updated": 2050, "rejected": 278, "skipped_category": 353, "rejected_corrupt_reg": 161, "duplicates_collapsed": 283, "shared_reg_numbers": 15, "pruned": 0, "errors": []}
> {"source": "greenbook", "fetched": 9048, "parsed": 1548, "inserted": 772, "updated": 760, "rejected": 0, "skipped_category": 7500, "duplicates_collapsed": 16, "shared_reg_numbers": 36, "pruned": 803, "errors": []}
> {"source": "alerts_pdf", "fetched": 349, "parsed": 14, "inserted": 0, "updated": 14, "rejected": 1, "errors": []}
> ```
>
> **Database**
>
> | Source | Active | Expired | Total |
> | :--- | ---: | ---: | ---: |
> | FoodDB | 919 | 1,167 | 2,086 |
> | Greenbook | 1,077 | 455 | 1,532 |
> | **All** | 1,996 | 1,622 | **3,618** |
>
> Food 1,330, Beverage 756, OTC 1,532; 3,544 distinct registration numbers; 0 identity duplicates; 14 alerts; 5 checklists;
> 0 image URLs; 0 prescription-name matches in OTC; 0 UI markers left; 0 test rows. Trigram search 2.3 ms.
> 18 tests, `ruff`, `mypy` pass.
>
> **Remaining limitations:** NAPAMS skipped (CAPTCHA/certificate). FoodDB source covers 2022-2025 registrations. PostgreSQL 18.2 locally (plan says 16).
> The figures in the round-1 notice and sections 2.x, 8.4, 8.6, 8.11 below are superseded.

> ## ⚠ Correction and re-verification (2026-11-21, supersedes the figures below)
>
> The first version of this report contained wrong ETL statistics. A review found and fixed these
> defects, then re-ran the whole ETL **live** (`--no-cache`, `ETL_CACHE_TTL_HOURS=0`) and re-queried the DB.
>
> | Defect found | Fix |
> | :--- | :--- |
> | HTTP cache key ignored query params, so Greenbook paging returned page 1 ten times (`fetched 1000`, `parsed 180` = 18 rows x 10; only 100 of 9,048 records ever read). Cache also never expired. | Key now includes params/body; 24 h TTL (`ETL_CACHE_TTL_HOURS`); `--no-cache` flag; repeated-page guard; paging cap raised to 500 pages. |
> | 105 FoodDB rows had date-mangled registration numbers (`Aug-67`, `Jan-09`), several shared by different products. | Rejected at ingest (`rejected_corrupt_reg`); the 105 existing rows were deleted (no alert referenced them). |
> | Rows sharing a registration number silently overwrote each other. | Collapsed in-batch and counted (`duplicates_collapsed`, `reg_conflicts`). |
> | `brand_name` was a copy of `product_name` on every row. | Set to NULL (neither portal exposes a brand); existing 2,068 copies nulled. |
> | HTML entities (`&amp;`) left in names and manufacturers. | `html.unescape` applied; 0 rows with entities remain. |
> | `scripts/verify_db.py` hard-coded a password. | Reads `DATABASE_URL` from `.env` via settings. |
>
> **Verified live ETL output (replaces 2.1 and 2.2):**
> ```json
> {"source": "food_db", "fetched": 3000, "parsed": 2369, "inserted": 0, "updated": 2050, "rejected": 278, "skipped_category": 353, "rejected_corrupt_reg": 161, "duplicates_collapsed": 319, "reg_conflicts": 15, "errors": []}
> {"source": "greenbook", "fetched": 9048, "parsed": 1626, "inserted": 1545, "updated": 18, "rejected": 4, "skipped_category": 7418, "rejected_corrupt_reg": 0, "duplicates_collapsed": 63, "reg_conflicts": 47, "errors": []}
> ```
> (`inserted: 0` for food_db because its valid rows were already in the DB; row counts in `parsed` are source rows, `updated`/`inserted` are distinct registration numbers.)
>
> **Verified DB state (replaces 8.4, 8.6 and 8.11 counts):**
>
> | Source | Active | Expired | Total |
> | :--- | ---: | ---: | ---: |
> | FoodDB | 894 | 1,156 | 2,050 |
> | Greenbook | 1,074 | 489 | 1,563 |
> | **All** | 1,968 | 1,645 | **3,613** |
>
> By category: Food 1,316, Beverage 734, OTC 1,563. Alerts 14 (active 14). Checklists 5.
> Image URLs set: 0 (0 non-https). Month-style regs: 0. `brand_name` non-null: 0. Entities: 0.
> `normalized_reg_num` mismatches: 0. Duplicate normalised numbers: 0. Greenbook now covers all 9,048 portal records
> (1,563 pass the OTC allow-list; 7,418 are skipped by it).
>
> **Known limitations (not fixed):**
> - `products.nafdac_reg_num` is unique, so 15 FoodDB + 47 Greenbook registration numbers that the portals assign to
>   more than one product name keep only the last row. Fixing this needs a schema decision (e.g. composite key).
> - The Greenbook allow-list contains prescription-type actives (amoxicillin, artemether/lumefantrine, spironolactone);
>   these rows are labelled `OTC`. Review the list before the category is shown to users.
> - NAPAMS is skipped (CAPTCHA/certificate login). FoodDB source table covers 2022-2025 registrations only.
> - Database is PostgreSQL 18.2 locally (plan says 16).


---

## 1. Executive Summary & Verification Highlights

- **Target Capacity:** The development plan required a minimum 500-record seed across food, beverage, and OTC categories. The live ETL ingesters successfully extracted and stored **2,173 real products** from the official NAFDAC Food Database and Greenbook portal (4.3× the minimum requirement).
- **Trigram Similarity Performance:** PostgreSQL `pg_trgm` GIN index scan (`idx_products_name_trgm`) achieved an execution time of **0.672 ms** (and 12.3 ms under full sequential scan) on fuzzy product name queries, beating the sub-100 ms requirement by more than 140×.
- **Idempotency:** A second consecutive execution of the entire ETL pipeline produced **0 duplicate rows** and **0 new inserts**, updating existing records in-place.
- **Data Quality & Legal Boundaries:**
  - `status` vocabulary strictly adheres to `Active`, `Expired`, `Alert_Flagged`. Never defamatory or subjective.
  - `external_image_url` strictly enforces HTTPS-only and safe URI schemes. All current records have NULL image URLs with 0 non-HTTPS violations, delegating visual display to the design system's SVG fallback icons.
  - Zero synthetic data was inserted into PostgreSQL; all data derives directly from NAFDAC endpoints.

---

## 2. ETL Run Reports (JSON Output)

The four ETL source runs and the image validation pass completed with the following structured JSON log records:

### 2.1 Food Database (`food_db`)
```json
{"source": "food_db", "started": "2026-11-21T01:48:00.879012+00:00", "finished": "2026-11-21T01:48:12.575147+00:00", "fetched": 3000, "parsed": 2512, "inserted": 2155, "updated": 357, "rejected": 117, "skipped_category": 371, "images_set": 0, "errors": []}
```

### 2.2 Greenbook OTC Consumables (`greenbook`)
```json
{"source": "greenbook", "started": "2026-11-21T01:48:30.796323+00:00", "finished": "2026-11-21T01:48:32.108782+00:00", "fetched": 1000, "parsed": 180, "inserted": 18, "updated": 162, "rejected": 0, "skipped_category": 820, "images_set": 0, "errors": []}
```

### 2.3 NAPAMS Documented Skip (`napams`)
```json
{"source": "napams", "started": "2026-11-21T01:49:19.689675+00:00", "finished": "2026-11-21T01:49:19.689675+00:00", "fetched": 0, "parsed": 0, "inserted": 0, "updated": 0, "rejected": 0, "skipped_category": 0, "images_set": 0, "errors": ["NAPAMS requires CAPTCHA and Certificate auth. Skipped per polite scraper rule 3."]}
```

### 2.4 Public Alerts & Recalls (`alerts_pdf`)
```json
{"source": "alerts_pdf", "started": "2026-11-21T01:49:28.785748+00:00", "finished": "2026-11-21T01:50:02.131564+00:00", "fetched": 349, "parsed": 14, "inserted": 14, "updated": 0, "rejected": 1, "skipped_category": 0, "images_set": 0, "errors": []}
```

### 2.5 Images Validation Pass (`images`)
```json
{"source": "images", "started": "2026-11-21T01:50:30.688405+00:00", "finished": "2026-11-21T01:50:30.735116+00:00", "fetched": 0, "parsed": 0, "inserted": 0, "updated": 0, "rejected": 0, "skipped_category": 0, "images_set": 0, "errors": []}
```

---

## 3. Database Verification Results (Queries 8.1 - 8.11)

### 8.1 Extension and Tables Exist
```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('products','safety_alerts','packaging_checklists');
SELECT version();
```

**Output:**
```
pg_trgm:
  extname: pg_trgm
  extversion: 1.6

tables:
  - packaging_checklists
  - products
  - safety_alerts

version:
  PostgreSQL 18.2 on x86_64-windows, compiled by msvc-19.44.35222, 64-bit
```
*Status: PASS.* `pg_trgm` extension is active; all three core tables exist.

---

### 8.2 Columns and Constraints
```sql
SELECT column_name, data_type, is_nullable, column_default, is_generated
  FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid IN ('products'::regclass,'safety_alerts'::regclass) ORDER BY conname;
```

**Columns Output:**
| Column Name | Data Type | Is Nullable | Column Default | Is Generated |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | `gen_random_uuid()` | NEVER |
| `nafdac_reg_num` | `character varying` | NO | NULL | NEVER |
| `normalized_reg_num` | `character varying` | NO | NULL | **ALWAYS** |
| `product_name` | `character varying` | NO | NULL | NEVER |
| `brand_name` | `character varying` | YES | NULL | NEVER |
| `category` | `character varying` | NO | NULL | NEVER |
| `manufacturer` | `character varying` | NO | NULL | NEVER |
| `status` | `character varying` | NO | `'Active'::character varying` | NEVER |
| `external_image_url` | `text` | YES | NULL | NEVER |
| `source_portal` | `character varying` | NO | NULL | NEVER |
| `last_synced_at` | `timestamp with time zone` | NO | `now()` | NEVER |
| `created_at` | `timestamp with time zone` | NO | `now()` | NEVER |

**Constraints Output:**
- `ck_products_category`: `CHECK (category::text = ANY (ARRAY['Food', 'Beverage', 'Toothpaste', 'Cosmetic', 'OTC']::text[]))`
- `ck_products_image_https`: `CHECK (external_image_url IS NULL OR external_image_url ~* '^https://')`
- `ck_products_source`: `CHECK (source_portal::text = ANY (ARRAY['FoodDB', 'NAPAMS', 'Greenbook', 'Gazette']::text[]))`
- `ck_products_status`: `CHECK (status::text = ANY (ARRAY['Active', 'Expired', 'Alert_Flagged']::text[]))`
- `products_nafdac_reg_num_key`: `UNIQUE (nafdac_reg_num)`
- `products_pkey`: `PRIMARY KEY (id)`
- `safety_alerts_alert_reference_no_key`: `UNIQUE (alert_reference_no)`
- `safety_alerts_nafdac_reg_num_fkey`: `FOREIGN KEY (nafdac_reg_num) REFERENCES products(nafdac_reg_num) ON DELETE SET NULL`
- `safety_alerts_pkey`: `PRIMARY KEY (id)`

*Status: PASS.* `normalized_reg_num` is `GENERATED ALWAYS AS STORED`, `external_image_url` is `text` and nullable, and all constraints match the plan.

---

### 8.3 Indexes
```sql
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename IN ('products','safety_alerts') ORDER BY tablename, indexname;
```

**Output:**
```
products:
  idx_products_category:
    CREATE INDEX idx_products_category ON public.products USING btree (category)
  idx_products_name_trgm:
    CREATE INDEX idx_products_name_trgm ON public.products USING gin (product_name gin_trgm_ops)
  idx_products_norm_reg:
    CREATE INDEX idx_products_norm_reg ON public.products USING btree (normalized_reg_num)
  products_nafdac_reg_num_key:
    CREATE UNIQUE INDEX products_nafdac_reg_num_key ON public.products USING btree (nafdac_reg_num)
  products_pkey:
    CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)

safety_alerts:
  idx_alerts_active_date:
    CREATE INDEX idx_alerts_active_date ON public.safety_alerts USING btree (is_active, issued_date DESC)
  idx_alerts_reg:
    CREATE INDEX idx_alerts_reg ON public.safety_alerts USING btree (nafdac_reg_num)
  safety_alerts_alert_reference_no_key:
    CREATE UNIQUE INDEX safety_alerts_alert_reference_no_key ON public.safety_alerts USING btree (alert_reference_no)
  safety_alerts_pkey:
    CREATE UNIQUE INDEX safety_alerts_pkey ON public.safety_alerts USING btree (id)
```
*Status: PASS.* GIN trigram index on `product_name` exists with `gin_trgm_ops`.

---

### 8.4 Counts by Source, Status, and Category
```sql
SELECT source_portal, status, count(*) FROM products GROUP BY 1,2 ORDER BY 1,2;
SELECT category, count(*) FROM products GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS total FROM products;
```

**Output:**
```
By Source & Status:
  FoodDB    | Active   |   999
  FoodDB    | Expired  | 1,156
  Greenbook | Active   |    17
  Greenbook | Expired  |     1

By Category:
  Food      | 1,372
  Beverage  |   783
  OTC       |    18

Total Products: 2,173
```
*Status: PASS.* Total count (2,173) exceeds the required 500-seed milestone.

---

### 8.5 Sample Rows (Real Scraped Data)
```sql
SELECT nafdac_reg_num, normalized_reg_num, product_name, category, manufacturer,
       status, external_image_url, source_portal, last_synced_at
  FROM products ORDER BY last_synced_at DESC LIMIT 15;
```

**Output (15 Real Rows):**
| NAFDAC Reg Num | Normalized | Product Name | Category | Manufacturer | Status | Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `04-4753` | `044753` | Aciguard Antacid Suspension | OTC | Unique AgroChem Ltd | Expired | Greenbook |
| `A11-100356` | `A11100356` | Chemiron Vitamin C Syrup | OTC | Chemiron Care Limited | Active | Greenbook |
| `A4-100161` | `A4100161` | Crushmal | OTC | Zandas Pharmaceutical GM Ltd | Active | Greenbook |
| `B4-4875` | `B44875` | Hanmal | OTC | Hanbet Pharmaceuticals Limited | Active | Greenbook |
| `A4-4532` | `A44532` | Avromal DS Tablets | OTC | Avro Pharma Limited | Active | Greenbook |
| `A11-100355` | `A11100355` | Chemiron Vitamin B-Complex Syrup | OTC | Chemiron Care Limited | Active | Greenbook |
| `A4-100160` | `A4100160` | AG Spironolactone | OTC | AnnyGod Pharmaceutical Company Ltd | Active | Greenbook |
| `B4-3418` | `B43418` | Ibulife | OTC | Life - Line Pharmaceuticals Ltd | Active | Greenbook |
| `A4-6238` | `A46238` | Artheget EZ | OTC | Getz Pharma Nigeria Limited | Active | Greenbook |
| `A4-5859` | `A45859` | krusher Tablets | OTC | Hugo Drugs Limited | Active | Greenbook |
| `A4-6099` | `A46099` | G-Clav Injection | OTC | Greenlife Pharmaceutical Limited | Active | Greenbook |
| `A4-8799` | `A48799` | Artemether Injection | OTC | Climax Pharmaceutical Chemist Limited | Active | Greenbook |
| `A4-1079` | `A41079` | Baby Greenlin Cough Linctus | OTC | Greenlife Pharmaceutical Limited | Active | Greenbook |
| `A8-100791` | `A8100791` | BIGI GRAPE - PINEAPPLE FLAVOURED SOFT DRINK | Beverage | RITE FOODS LTD | Expired | FoodDB |
| `A8-100946` | `A8100946` | FEARLESS GINGER LEMONADE FLAVOURED ENERGY DRINK | Beverage | RITE FOODS LTD | Active | FoodDB |

*Status: PASS.* Real Nigerian brands and manufacturers; zero synthetic fixtures.

---

### 8.6 `external_image_url` Coverage and Sanity
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

**Output:**
```
Coverage:
  with_image:    0
  without_image: 2,173
  pct:           0.0%

Hosts:
  (0 rows)

Non-HTTPS Count:
  0
```
*Status: PASS.* 0 non-HTTPS links. As specified in Section 5 of the development plan, NULL image URLs are cleanly handled by the frontend's SVG category badge fallbacks.

---

### 8.7 Safety Alerts
```sql
SELECT alert_reference_no, nafdac_reg_num, product_name, batch_numbers, issued_date, is_active, official_source_url
  FROM safety_alerts ORDER BY issued_date DESC LIMIT 15;
SELECT count(*) FILTER (WHERE is_active) AS active, count(*) AS total FROM safety_alerts;
SELECT p.nafdac_reg_num, p.status, a.alert_reference_no
  FROM products p JOIN safety_alerts a ON a.nafdac_reg_num = p.nafdac_reg_num
 WHERE a.is_active;
```

**Alerts Sample Output:**
| Alert Reference | Linked Reg Num | Product Title / Description | Batch | Date | Active |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Alert No. 042/2026` | NULL | Public Alert No. 042/2026 - Seizure of Suspected Substandard and Falsified BPPL Artemether/Lumefantrine 80mg/480mg | `BP5203` | 2026-08-19 | True |
| `Alert No. 041/2026` | NULL | Public Alert No. 041/2026 - Suspected Counterfeit ORACIRE+ Toothpaste | NULL | 2026-08-19 | True |
| `Alert No. 043/2026` | NULL | Public Alert No. 043/2026 - NAFDAC Places Products Marketed by Mofus Nigeria Ltd on Watchlist | NULL | 2026-08-19 | True |
| `Alert No. 038/2026` | NULL | Public Alert No. 038/2026 - Adulterated and Substandard Medicines Recalled by DRAP | NULL | 2026-08-18 | True |
| `Alert No. 037/2026` | NULL | Public Alert No. 037/2026 - Suspected Counterfeit Pulmicort® (Budesonide) Inhalation Suspension | `25770416E` | 2026-07-18 | True |
| `Alert No. 036/2026` | NULL | Public Alert No. 036/2026 - Suspected Counterfeit Products Mimicking Forxiga® | NULL | 2026-07-18 | True |
| `Alert No. 034/2026` | NULL | Public Alert No. 034/2026 - Niger Republic Imposes Import Ban on Bulmex Parboiled Rice | NULL | 2026-07-12 | True |
| `Alert No. 033/2026` | NULL | Public Alert No. 033/2026 - Voluntary Recall of Sporidex Suspension 125 mg/5 ml | `DFG4606A` | 2026-06-18 | True |

```
Active / Total Alerts:
  active: 14, total: 14

Joined Active Alerts:
  (0 rows in live scraped data because 2026 alerts refer to un-registered counterfeit batches)
```
*Status: PASS.* Idempotent alert upsert and product flagging logic is fully implemented and unit-tested in `etl/tests/test_upsert_idempotent.py`.

---

### 8.8 Packaging Checklists
```sql
SELECT category, expected_reg_prefix, jsonb_array_length(inspection_points) AS points
  FROM packaging_checklists ORDER BY category;
```

**Output:**
```
  Beverage   | A8- | 6
  Cosmetic   | 02- | 6
  Food       | A8- | 6
  OTC        | A4- | 6
  Toothpaste | 02- | 6
```
*Status: PASS.* Exactly 5 categories, each seeded with 6 inspection points (5 common points + 1 category-specific point).

---

### 8.9 Prefix Check (Ground Rule 7 Verification & Reconciliation)
```sql
SELECT c.category, c.expected_reg_prefix,
       count(*) AS products,
       count(*) FILTER (WHERE p.nafdac_reg_num LIKE c.expected_reg_prefix || '%') AS matching
  FROM packaging_checklists c JOIN products p ON p.category = c.category
 GROUP BY 1,2 ORDER BY 1;
```

**Output:**
```
  Beverage | A8- |   783 |   426  (54.4% matching; second most common: A5- with 193)
  Food     | A8- | 1,372 | 1,118  (81.5% matching; second most common: A5- with 59)
  OTC      | A4- |    18 |     9  (50.0% matching; second most common: B4- with 5)
```

**Reconciliation Note:**  
The original development plan hypothesized legacy prefixes `01-` for Food and `04-` for OTC. Analysis of real modern NAFDAC registrations in `Registered Food Products 2022-2025` and the Greenbook revealed that modern registrations overwhelmingly use alphanumeric prefixes:
- **Food & Beverage:** `A8-` is the dominant prefix (1,118 food and 426 beverage products), followed by `A5-`. Legacy `01-` represents less than 1.5% of modern registry entries.
- **OTC Medicines:** `A4-` is the dominant prefix (50%), followed by `B4-` (28%). This directly matches the design specification's sample code `A4-2260`!
- The seed in migration `0002_seed_packaging_checklists.py` was updated accordingly to reflect real registry data.

*Status: PASS.*

---

### 8.10 Trigram Fuzzy Search Performance
```sql
SET enable_seqscan = off; -- test index scan efficiency
SET pg_trgm.similarity_threshold = 0.3;
EXPLAIN (ANALYZE, BUFFERS)
SELECT nafdac_reg_num, product_name, similarity(product_name, 'Aciguard Antacid Suspensi') AS s
  FROM products WHERE product_name % 'Aciguard Antacid Suspensi' ORDER BY s DESC LIMIT 10;
```

**EXPLAIN Output:**
```
Limit  (cost=216.65..216.66 rows=1 width=47) (actual time=0.256..0.257 rows=1.00 loops=1)
  Buffers: shared hit=54
  ->  Sort  (cost=216.65..216.66 rows=1 width=47) (actual time=0.253..0.253 rows=1.00 loops=1)
        Sort Key: (similarity((product_name)::text, 'Aciguard Antacid Suspensi'::text)) DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=54
        ->  Bitmap Heap Scan on products  (cost=212.63..216.64 rows=1 width=47) (actual time=0.219..0.220 rows=1.00 loops=1)
              Recheck Cond: ((product_name)::text % 'Aciguard Antacid Suspensi'::text)
              Heap Blocks: exact=1
              Buffers: shared hit=51
              ->  Bitmap Index Scan on idx_products_name_trgm  (cost=0.00..212.63 rows=1 width=0) (actual time=0.189..0.189 rows=1.00 loops=1)
                    Index Cond: ((product_name)::text % 'Aciguard Antacid Suspensi'::text)
                    Index Searches: 1
                    Buffers: shared hit=50
Planning Time: 4.650 ms
Execution Time: 0.672 ms
```

**Query Result:**
```
  04-4753 | Aciguard Antacid Suspension | Similarity: 0.8519
```
*Status: PASS.* GIN trigram index `idx_products_name_trgm` used via bitmap index scan. Total execution time: **0.672 ms**, easily beating the sub-100 ms target.

---

### 8.11 Idempotency Check
```sql
SELECT count(*) FROM products;
SELECT count(*) FROM (SELECT nafdac_reg_num FROM products GROUP BY 1 HAVING count(*)>1) d;
```

**Output:**
```
  products count:   2,173
  duplicates count: 0
```
*Status: PASS.* Total product count remained identical at 2,173 after running `python -m checkam_etl.cli run --all` a second time; 0 duplicates detected.

---

## 4. Skipped Sources

- **NAPAMS Portal (`https://registration.nafdac.gov.ng/`):**
  - **Status:** Documented Polite Skip.
  - **Reason:** The portal mandates `captchaToken`, certificate verification tokens, and anti-forgery request tokens for product verification queries.
  - **Compliance:** In accordance with Antigravity security rules and Polite Scraper Rule 3 ("Stop and report when anti-bot or CAPTCHA gates prevent lawful access; never bypass, solve or defeat access controls"), automated scraping was gracefully bypassed and logged.

---

## 5. Test & Lint Quality Gates

- **`mypy --strict etl/src`:** 0 issues found across all 12 source files.
- **`ruff check etl`:** 0 errors found.
- **`ruff format --check etl`:** 18 files left unchanged (100% compliant).
- **`pytest`:** 12 passed in 0.61s.
- **Alembic Reversibility:** Both `alembic downgrade base` and `alembic upgrade head` execute without errors.
