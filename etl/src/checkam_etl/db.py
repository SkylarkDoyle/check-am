from datetime import date
from typing import Any

import psycopg
from pydantic import BaseModel, ConfigDict

from checkam_etl.settings import settings


class ProductRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nafdac_reg_num: str
    product_name: str
    brand_name: str | None = None
    category: str
    manufacturer: str
    status: str = "Active"
    external_image_url: str | None = None
    source_portal: str
    registered_on: date | None = None
    expires_on: date | None = None
    pack_type: str | None = None
    pack_size: str | None = None
    dosage_form: str | None = None


def _name_key(name: str) -> str:
    return name.strip().lower()


def dedupe_products(rows: list[ProductRow]) -> tuple[list[ProductRow], int, int]:
    """Collapse rows with the same identity (registration number + case-insensitive name).

    Several different products may legitimately share one registration number, so they are all
    kept. Returns (unique_rows, duplicates_collapsed, shared_reg_numbers) where the last value
    counts registration numbers that carry more than one distinct product.
    """
    by_key: dict[tuple[str, str], ProductRow] = {}
    names_per_reg: dict[str, set[str]] = {}
    collapsed = 0
    for r in rows:
        key = (r.nafdac_reg_num, _name_key(r.product_name))
        if key in by_key:
            collapsed += 1
        by_key[key] = r
        names_per_reg.setdefault(r.nafdac_reg_num, set()).add(key[1])
    shared = sum(1 for names in names_per_reg.values() if len(names) > 1)
    return list(by_key.values()), collapsed, shared


def prune_stale_products(
    conn: psycopg.Connection[Any], source_portal: str, run_started: str, kept: int
) -> int:
    """Delete rows of one source that the latest complete run did not see.

    Safety: refuses (returns 0) if the run kept fewer than half of the rows currently stored,
    which would indicate a truncated fetch. Alert-flagged products are never pruned.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM products WHERE source_portal = %s", (source_portal,))
        row = cur.fetchone()
        existing = int(row[0]) if row else 0
        if existing and kept < existing * 0.5:
            return 0
        cur.execute(
            "DELETE FROM products WHERE source_portal = %s AND last_synced_at < %s::timestamptz "
            "AND status <> 'Alert_Flagged'",
            (source_portal, run_started),
        )
        deleted = cur.rowcount
    conn.commit()
    return deleted


def get_db_connection(database_url: str | None = None) -> psycopg.Connection[Any]:
    url = database_url or settings.database_url
    # psycopg expects standard postgresql://
    conn_url = url.replace("postgresql+psycopg://", "postgresql://")
    return psycopg.connect(conn_url)


def upsert_products_batch(
    products: list[ProductRow],
    conn: psycopg.Connection[Any],
    batch_size: int = 500,
) -> tuple[int, int]:
    """Upsert a list of ProductRow in batches. Returns (inserted_count, updated_count)."""
    if not products:
        return 0, 0

    upsert_sql = """
    INSERT INTO products
      (nafdac_reg_num, product_name, brand_name, category, manufacturer,
       status, external_image_url, source_portal, registered_on, expires_on,
       pack_type, pack_size, dosage_form, last_synced_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
    ON CONFLICT (nafdac_reg_num, (lower(btrim(product_name)))) DO UPDATE SET
      product_name       = EXCLUDED.product_name,
      brand_name         = COALESCE(EXCLUDED.brand_name, products.brand_name),
      category           = EXCLUDED.category,
      manufacturer       = EXCLUDED.manufacturer,
      status             = CASE WHEN products.status = 'Alert_Flagged'
                                AND EXCLUDED.status = 'Active'
                                THEN products.status ELSE EXCLUDED.status END,
      external_image_url = COALESCE(EXCLUDED.external_image_url, products.external_image_url),
      source_portal      = EXCLUDED.source_portal,
      registered_on      = COALESCE(EXCLUDED.registered_on, products.registered_on),
      expires_on         = COALESCE(EXCLUDED.expires_on, products.expires_on),
      pack_type          = COALESCE(EXCLUDED.pack_type, products.pack_type),
      pack_size          = COALESCE(EXCLUDED.pack_size, products.pack_size),
      dosage_form        = COALESCE(EXCLUDED.dosage_form, products.dosage_form),
      last_synced_at     = now()
    RETURNING (xmax = 0) AS inserted;
    """

    total_inserted = 0
    total_updated = 0

    with conn.cursor() as cur:
        for i in range(0, len(products), batch_size):
            batch = products[i : i + batch_size]
            for p in batch:
                cur.execute(
                    upsert_sql,
                    (
                        p.nafdac_reg_num,
                        p.product_name,
                        p.brand_name,
                        p.category,
                        p.manufacturer,
                        p.status,
                        p.external_image_url,
                        p.source_portal,
                        p.registered_on,
                        p.expires_on,
                        p.pack_type,
                        p.pack_size,
                        p.dosage_form,
                    ),
                )
                row = cur.fetchone()
                if row and row[0]:
                    total_inserted += 1
                else:
                    total_updated += 1
            conn.commit()

    return total_inserted, total_updated


def upsert_safety_alert(
    alert_data: dict[str, Any],
    conn: psycopg.Connection[Any],
) -> bool:
    """Upsert a single safety alert and flag the corresponding product. Returns True if inserted."""
    upsert_sql = """
    INSERT INTO safety_alerts (alert_reference_no, nafdac_reg_num, title, product_name,
        batch_numbers, summary, official_source_url, issued_date, is_active)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (alert_reference_no) DO UPDATE SET
        nafdac_reg_num      = COALESCE(EXCLUDED.nafdac_reg_num, safety_alerts.nafdac_reg_num),
        title               = COALESCE(EXCLUDED.title, safety_alerts.title),
        product_name        = EXCLUDED.product_name,
        batch_numbers       = EXCLUDED.batch_numbers,
        summary             = EXCLUDED.summary,
        official_source_url = EXCLUDED.official_source_url,
        issued_date         = EXCLUDED.issued_date,
        is_active           = EXCLUDED.is_active
    RETURNING (xmax = 0) AS inserted;
    """
    with conn.cursor() as cur:
        cur.execute(
            upsert_sql,
            (
                alert_data["alert_reference_no"],
                alert_data.get("nafdac_reg_num"),
                alert_data.get("title"),
                alert_data["product_name"],
                alert_data.get("batch_numbers"),
                alert_data["summary"],
                alert_data["official_source_url"],
                alert_data["issued_date"],
                alert_data.get("is_active", True),
            ),
        )
        res = cur.fetchone()
        is_inserted = bool(res and res[0])

        # Link alert to product(s) if nafdac_reg_num matched
        reg_num = alert_data.get("nafdac_reg_num")
        if reg_num:
            cur.execute(
                "SELECT id FROM safety_alerts WHERE alert_reference_no = %s",
                (alert_data["alert_reference_no"],),
            )
            alert_row = cur.fetchone()
            if alert_row:
                alert_id = alert_row[0]
                cur.execute("SELECT id FROM products WHERE nafdac_reg_num = %s", (reg_num,))
                matched_products = cur.fetchall()
                for prod_row in matched_products:
                    cur.execute(
                        "INSERT INTO safety_alert_products (alert_id, product_id) "
                        "VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        (alert_id, prod_row[0]),
                    )

            if alert_data.get("is_active", True):
                cur.execute(
                    "UPDATE products SET status = 'Alert_Flagged' WHERE nafdac_reg_num = %s",
                    (reg_num,),
                )

        conn.commit()
    return is_inserted
