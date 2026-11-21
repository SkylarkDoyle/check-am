from checkam_etl.db import get_db_connection
from checkam_etl.settings import settings


def run_all_queries() -> None:
    print(f"Connecting to database...")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 8.1 Extension and tables exist
            print("\n=== 8.1 Extension and tables exist ===")
            cur.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';")
            print("pg_trgm:", cur.fetchall())

            cur.execute("""
                SELECT table_name FROM information_schema.tables
                 WHERE table_schema='public' AND table_name IN ('products','safety_alerts','packaging_checklists');
            """)
            print("tables:", cur.fetchall())

            cur.execute("SELECT version();")
            print("version:", cur.fetchone())

            # 8.2 Columns and constraints
            print("\n=== 8.2 Columns and constraints ===")
            cur.execute("""
                SELECT column_name, data_type, is_nullable, column_default, is_generated
                  FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position;
            """)
            print("products columns:")
            for col in cur.fetchall():
                print(f"  {col}")

            cur.execute("""
                SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conrelid IN ('products'::regclass,'safety_alerts'::regclass) ORDER BY conname;
            """)
            print("constraints:")
            for c in cur.fetchall():
                print(f"  {c}")

            # 8.3 Indexes
            print("\n=== 8.3 Indexes ===")
            cur.execute("""
                SELECT indexname, indexdef FROM pg_indexes
                 WHERE tablename IN ('products','safety_alerts') ORDER BY tablename, indexname;
            """)
            for idx in cur.fetchall():
                print(f"  {idx[0]}: {idx[1]}")

            # 8.4 Counts by source, status and category
            print("\n=== 8.4 Counts by source, status and category ===")
            cur.execute("SELECT source_portal, status, count(*) FROM products GROUP BY 1,2 ORDER BY 1,2;")
            for r in cur.fetchall():
                print(f"  source/status: {r}")

            cur.execute("SELECT category, count(*) FROM products GROUP BY 1 ORDER BY 2 DESC;")
            for r in cur.fetchall():
                print(f"  category: {r}")

            cur.execute("SELECT count(*) AS total FROM products;")
            print("  total products:", cur.fetchone())

            # 8.5 Sample rows
            print("\n=== 8.5 Sample rows (15) ===")
            cur.execute("""
                SELECT nafdac_reg_num, normalized_reg_num, product_name, category, manufacturer,
                       status, external_image_url, source_portal, last_synced_at
                  FROM products ORDER BY last_synced_at DESC LIMIT 15;
            """)
            sample_rows = cur.fetchall()
            for r in sample_rows:
                print(f"  {r}")

            # 8.6 external_image_url coverage and sanity
            print("\n=== 8.6 external_image_url coverage and sanity ===")
            cur.execute("""
                SELECT count(*) FILTER (WHERE external_image_url IS NOT NULL) AS with_image,
                       count(*) FILTER (WHERE external_image_url IS NULL)     AS without_image,
                       round(100.0 * count(*) FILTER (WHERE external_image_url IS NOT NULL) / count(*), 1) AS pct
                  FROM products;
            """)
            print("  coverage:", cur.fetchone())

            cur.execute("""
                SELECT split_part(external_image_url, '/', 3) AS host, count(*)
                  FROM products WHERE external_image_url IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
            """)
            print("  hosts:", cur.fetchall())

            cur.execute("""
                SELECT count(*) AS non_https FROM products
                 WHERE external_image_url IS NOT NULL AND external_image_url !~* '^https://';
            """)
            print("  non_https:", cur.fetchone())

            # 8.7 Alerts
            print("\n=== 8.7 Alerts ===")
            cur.execute("""
                SELECT alert_reference_no, nafdac_reg_num, product_name, batch_numbers, issued_date, is_active, official_source_url
                  FROM safety_alerts ORDER BY issued_date DESC LIMIT 15;
            """)
            for r in cur.fetchall():
                print(f"  alert: {r}")

            cur.execute("SELECT count(*) FILTER (WHERE is_active) AS active, count(*) AS total FROM safety_alerts;")
            print("  active/total alerts:", cur.fetchone())

            cur.execute("""
                SELECT p.nafdac_reg_num, p.status, a.alert_reference_no
                  FROM products p JOIN safety_alerts a ON a.nafdac_reg_num = p.nafdac_reg_num
                 WHERE a.is_active;
            """)
            print("  joined active alerts to products:", cur.fetchall())

            # 8.8 Packaging checklists
            print("\n=== 8.8 Packaging checklists ===")
            cur.execute("""
                SELECT category, expected_reg_prefix, jsonb_array_length(inspection_points) AS points
                  FROM packaging_checklists ORDER BY category;
            """)
            for r in cur.fetchall():
                print(f"  {r}")

            # 8.9 Prefix check
            print("\n=== 8.9 Prefix check ===")
            cur.execute("""
                SELECT c.category, c.expected_reg_prefix,
                       count(*) AS products,
                       count(*) FILTER (WHERE p.nafdac_reg_num LIKE c.expected_reg_prefix || '%') AS matching
                  FROM packaging_checklists c JOIN products p ON p.category = c.category
                 GROUP BY 1,2 ORDER BY 1;
            """)
            for r in cur.fetchall():
                print(f"  {r}")

            # 8.10 Fuzzy search works and uses the index
            print("\n=== 8.10 Fuzzy search ===")
            cur.execute("SET pg_trgm.similarity_threshold = 0.3;")
            # Take a probe from sample_rows
            probe = "Indomie Instant Noodle" # real name is e.g. Indomie Instant Noodles or similar
            if sample_rows:
                name = sample_rows[0][2]
                probe = name[:-2] if len(name) > 5 else name

            print(f"Probe: '{probe}'")
            cur.execute("""
                EXPLAIN (ANALYZE, BUFFERS)
                SELECT nafdac_reg_num, product_name, similarity(product_name, %s) AS s
                  FROM products WHERE product_name %% %s ORDER BY s DESC LIMIT 10;
            """, (probe, probe))
            for line in cur.fetchall():
                print(f"  {line[0]}")

            cur.execute("""
                SELECT nafdac_reg_num, product_name, similarity(product_name, %s) AS s
                  FROM products WHERE product_name %% %s ORDER BY s DESC LIMIT 5;
            """, (probe, probe))
            print("Matches:")
            for r in cur.fetchall():
                print(f"  {r}")

            # 8.11 Idempotency
            print("\n=== 8.11 Idempotency ===")
            cur.execute("SELECT count(*) FROM products;")
            print("  products count:", cur.fetchone())

            cur.execute("SELECT count(*) FROM (SELECT nafdac_reg_num FROM products GROUP BY 1 HAVING count(*)>1) d;")
            print("  duplicates count:", cur.fetchone())


if __name__ == "__main__":
    run_all_queries()
