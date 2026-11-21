import sys

import psycopg

sys.path.insert(0, "etl/src")
from checkam_etl.settings import settings  # noqa: E402

conn_str = settings.database_url.replace("postgresql+psycopg://", "postgresql://")

with psycopg.connect(conn_str) as conn:
    with conn.cursor() as cur:
        print("=== 8.1 Extension, tables, version ===")
        cur.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';")
        print("Extension:", cur.fetchall())
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('products','safety_alerts','packaging_checklists');")
        print("Tables:", cur.fetchall())
        cur.execute("SELECT version();")
        print("Version:", cur.fetchone())

        print("\n=== 8.2 Columns and Constraints ===")
        cur.execute("SELECT column_name, data_type, is_nullable, column_default, is_generated FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position;")
        for row in cur.fetchall():
            print("Col:", row)
        cur.execute("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('products'::regclass,'safety_alerts'::regclass);")
        for row in cur.fetchall():
            print("Constraint:", row)

        print("\n=== 8.3 Indexes ===")
        cur.execute("SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('products','safety_alerts') ORDER BY tablename, indexname;")
        for row in cur.fetchall():
            print("Index:", row)

        print("\n=== 8.8 Packaging Checklists ===")
        cur.execute("SELECT category, expected_reg_prefix, jsonb_array_length(inspection_points) AS points FROM packaging_checklists ORDER BY category;")
        for row in cur.fetchall():
            print("Checklist:", row)
