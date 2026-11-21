import base64
import json
from datetime import date
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.reg import normalize_reg
from app.schemas import (
    DB_TO_API_STATUS,
    DB_TO_UI_CATEGORY,
    UI_TO_DB_CATEGORY,
    AlertSummary,
    ChecklistPoint,
    ChecklistResponse,
    ProductDetail,
    ProductSearchResult,
    ProductSummary,
    UiCategory,
)

GENERIC_COMMON_POINTS: list[dict[str, str]] = [
    {
        "key": "reg_number",
        "label": "NAFDAC number on pack",
        "detail": "Printed clearly, matches {reg_number}.",
        "kind": "common",
    },
    {
        "key": "seal_intact",
        "label": "Seal intact",
        "detail": "No gaps, glue marks or re-taping.",
        "kind": "common",
    },
    {
        "key": "print_quality",
        "label": "Spelling and print quality",
        "detail": "Brand and maker names read correctly, no smudging.",
        "kind": "common",
    },
    {
        "key": "expiry_format",
        "label": "Expiry date format",
        "detail": "One consistent style, for example {expiry_example}.",
        "kind": "common",
    },
    {
        "key": "batch_mfr",
        "label": "Batch and manufacture date",
        "detail": "Present, printed in the same style as the expiry date.",
        "kind": "common",
    },
]


def map_row_to_summary(row: dict[str, Any]) -> ProductSummary:
    db_cat = str(row["category"])
    ui_cat = DB_TO_UI_CATEGORY.get(db_cat, "Food")
    api_status = DB_TO_API_STATUS.get(str(row["status"]), "lapsed")

    return ProductSummary(
        id=row["id"],
        reg_number=str(row["nafdac_reg_num"]),
        reg_normalized=str(row["normalized_reg_num"]),
        name=str(row["product_name"]),
        brand=row.get("brand_name"),
        category=ui_cat,
        category_raw=db_cat,
        pack_type=row.get("pack_type"),
        pack_size=row.get("pack_size"),
        dosage_form=row.get("dosage_form"),
        manufacturer=str(row["manufacturer"]),
        status=api_status,
        registered_on=row.get("registered_on"),
        expires_on=row.get("expires_on"),
        image_url=row.get("external_image_url"),
        source=str(row["source_portal"]),
        last_synced_at=row["last_synced_at"],
    )


def encode_cursor(name: str, id_val: UUID) -> str:
    raw = f"{name}||{id_val}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("utf-8")


def decode_cursor(cursor: str) -> tuple[str, UUID] | None:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
        parts = raw.split("||")
        if len(parts) == 2:
            return parts[0], UUID(parts[1])
    except Exception:
        return None
    return None


async def get_products_feed(
    conn: AsyncConnection[dict[str, Any]],
    category: UiCategory | None = None,
    limit: int = 10,
    cursor: str | None = None,
) -> tuple[list[ProductSummary], str | None, bool]:
    limit = min(max(1, limit), 50)
    params: list[Any] = []
    where_clauses: list[str] = []

    if category and category in UI_TO_DB_CATEGORY:
        db_cats = UI_TO_DB_CATEGORY[category]
        where_clauses.append("category = ANY(%s)")
        params.append(db_cats)

    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            last_name, last_id = decoded
            where_clauses.append("(product_name, id) > (%s, %s)")
            params.extend([last_name, last_id])

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    sql = f"""
        SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
               category, pack_type, pack_size, dosage_form, manufacturer,
               status, registered_on, expires_on, external_image_url,
               source_portal, last_synced_at
        FROM products
        {where_sql}
        ORDER BY product_name ASC, id ASC
        LIMIT %s;
    """
    params.append(limit + 1)

    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        rows = await cur.fetchall()

    has_more = len(rows) > limit
    returned_rows = rows[:limit]
    next_cursor = None
    if has_more and returned_rows:
        last = returned_rows[-1]
        next_cursor = encode_cursor(last["product_name"], last["id"])

    items = [map_row_to_summary(r) for r in returned_rows]
    return items, next_cursor, has_more


async def get_product_by_id(
    conn: AsyncConnection[dict[str, Any]],
    product_id: UUID,
) -> ProductDetail | None:
    sql = """
        SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
               category, pack_type, pack_size, dosage_form, manufacturer,
               status, registered_on, expires_on, external_image_url,
               source_portal, last_synced_at
        FROM products
        WHERE id = %s;
    """
    async with conn.cursor() as cur:
        await cur.execute(sql, (product_id,))
        row = await cur.fetchone()
        if not row:
            return None

        # Fetch linked alerts
        alerts_sql = """
            SELECT a.id, a.alert_reference_no, a.title, a.product_name,
                   a.batch_numbers, a.summary, a.official_source_url,
                   a.issued_date, a.is_active
            FROM safety_alerts a
            JOIN safety_alert_products sap ON sap.alert_id = a.id
            WHERE sap.product_id = %s
            ORDER BY a.issued_date DESC;
        """
        await cur.execute(alerts_sql, (product_id,))
        alert_rows = await cur.fetchall()

    summary = map_row_to_summary(row)
    alerts = [
        AlertSummary(
            id=ar["id"],
            alert_reference_no=ar["alert_reference_no"],
            title=ar.get("title"),
            product_name=ar["product_name"],
            batch_numbers=ar.get("batch_numbers"),
            summary=ar["summary"],
            official_source_url=ar["official_source_url"],
            issued_date=ar["issued_date"],
            is_active=ar["is_active"],
        )
        for ar in alert_rows
    ]

    # Resolve checklist
    checklist = await resolve_product_checklist(
        conn,
        category=row["category"],
        pack_type=row.get("pack_type"),
        reg_number=row["nafdac_reg_num"],
        expires_on=row.get("expires_on"),
    )

    return ProductDetail(
        **summary.model_dump(),
        alerts=alerts,
        checklist=checklist,
    )


async def lookup_by_reg(
    conn: AsyncConnection[dict[str, Any]],
    raw_reg: str,
) -> list[ProductSummary]:
    norm = normalize_reg(raw_reg)
    if not norm:
        return []

    sql = """
        SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
               category, pack_type, pack_size, dosage_form, manufacturer,
               status, registered_on, expires_on, external_image_url,
               source_portal, last_synced_at
        FROM products
        WHERE normalized_reg_num = %s
        ORDER BY product_name ASC;
    """
    async with conn.cursor() as cur:
        await cur.execute(sql, (norm,))
        rows = await cur.fetchall()

    return [map_row_to_summary(r) for r in rows]


async def search_products(
    conn: AsyncConnection[dict[str, Any]],
    query: str,
    category: UiCategory | None = None,
    limit: int = 20,
) -> list[ProductSearchResult]:
    limit = min(max(1, limit), 50)
    norm = normalize_reg(query)
    q_trimmed = query.strip()
    db_cats = UI_TO_DB_CATEGORY.get(category) if category else None

    results: list[ProductSearchResult] = []
    seen_ids: set[UUID] = set()

    async with conn.cursor() as cur:
        # 1. Registration Number Exact & Prefix Match (if query looks like reg)
        if norm and len(norm) >= 3 and any(c.isdigit() for c in norm):
            cat_clause = "AND category = ANY(%s)" if db_cats else ""
            cat_args = [db_cats] if db_cats else []

            # Exact match
            exact_sql = f"""
                SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
                       category, pack_type, pack_size, dosage_form, manufacturer,
                       status, registered_on, expires_on, external_image_url,
                       source_portal, last_synced_at, 'reg_exact' AS match_type, 1.0 AS sim
                FROM products
                WHERE normalized_reg_num = %s {cat_clause}
                ORDER BY product_name ASC LIMIT %s;
            """
            await cur.execute(exact_sql, [norm, *cat_args, limit])
            for r in await cur.fetchall():
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    sum_obj = map_row_to_summary(r)
                    results.append(
                        ProductSearchResult(
                            **sum_obj.model_dump(),
                            match_type="reg_exact",
                            similarity=1.0,
                        )
                    )

            # Prefix match
            if len(results) < limit:
                prefix_sql = f"""
                    SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
                           category, pack_type, pack_size, dosage_form, manufacturer,
                           status, registered_on, expires_on, external_image_url,
                           source_portal, last_synced_at, 'reg_prefix' AS match_type, 0.9 AS sim
                    FROM products
                    WHERE normalized_reg_num LIKE %s || '%%'
                      AND normalized_reg_num <> %s
                      {cat_clause}
                    ORDER BY product_name ASC LIMIT %s;
                """
                await cur.execute(prefix_sql, [norm, norm, *cat_args, limit - len(results)])
                for r in await cur.fetchall():
                    if r["id"] not in seen_ids:
                        seen_ids.add(r["id"])
                        sum_obj = map_row_to_summary(r)
                        results.append(
                            ProductSearchResult(
                                **sum_obj.model_dump(),
                                match_type="reg_prefix",
                                similarity=0.9,
                            )
                        )

        # 2. Text Search: Trigram name similarity + Substring ILIKE
        if len(results) < limit and len(q_trimmed) >= 2:
            remaining = limit - len(results)
            await cur.execute("SET LOCAL pg_trgm.similarity_threshold = 0.2;")
            cat_filter = "AND category = ANY(%s)" if db_cats else ""
            cat_args = [db_cats] if db_cats else []

            name_sql = f"""
                SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
                       category, pack_type, pack_size, dosage_form, manufacturer,
                       status, registered_on, expires_on, external_image_url,
                       source_portal, last_synced_at, 'name' AS match_type,
                       similarity(product_name, %s) AS sim
                FROM products
                WHERE (product_name %% %s OR product_name ILIKE '%%' || %s || '%%')
                  {cat_filter}
                ORDER BY sim DESC, product_name ASC
                LIMIT %s;
            """
            await cur.execute(name_sql, [q_trimmed, q_trimmed, q_trimmed, *cat_args, remaining])
            for r in await cur.fetchall():
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    sum_obj = map_row_to_summary(r)
                    results.append(
                        ProductSearchResult(
                            **sum_obj.model_dump(),
                            match_type="name",
                            similarity=float(r["sim"]) if r.get("sim") is not None else None,
                        )
                    )

        # 3. Manufacturer fallback
        if len(results) < limit and len(q_trimmed) >= 3:
            remaining = limit - len(results)
            cat_filter = "AND category = ANY(%s)" if db_cats else ""
            cat_args = [db_cats] if db_cats else []

            maker_sql = f"""
                SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
                       category, pack_type, pack_size, dosage_form, manufacturer,
                       status, registered_on, expires_on, external_image_url,
                       source_portal, last_synced_at, 'maker' AS match_type, 0.5 AS sim
                FROM products
                WHERE manufacturer ILIKE '%%' || %s || '%%'
                  {cat_filter}
                ORDER BY product_name ASC
                LIMIT %s;
            """
            await cur.execute(maker_sql, [q_trimmed, *cat_args, remaining])
            for r in await cur.fetchall():
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    sum_obj = map_row_to_summary(r)
                    results.append(
                        ProductSearchResult(
                            **sum_obj.model_dump(),
                            match_type="maker",
                            similarity=0.5,
                        )
                    )

    return results


async def get_all_checklists(
    conn: AsyncConnection[dict[str, Any]],
) -> list[ChecklistResponse]:
    sql = """
        SELECT category, variant, inspection_points, expected_reg_prefix
        FROM packaging_checklists
        ORDER BY category, variant;
    """
    async with conn.cursor() as cur:
        await cur.execute(sql)
        rows = await cur.fetchall()

    result: list[ChecklistResponse] = []
    for r in rows:
        points_raw = r["inspection_points"]
        if isinstance(points_raw, str):
            points_raw = json.loads(points_raw)
        points = [
            ChecklistPoint(
                key=p["key"],
                label=p["label"],
                detail=p["detail"],
                kind=p.get("kind", "common"),
            )
            for p in points_raw
        ]
        result.append(
            ChecklistResponse(
                category=r["category"],
                variant=r["variant"],
                expected_reg_prefix=r["expected_reg_prefix"],
                points=points,
            )
        )
    return result


async def resolve_product_checklist(
    conn: AsyncConnection[dict[str, Any]],
    category: str,
    pack_type: str | None = None,
    reg_number: str | None = None,
    expires_on: date | None = None,
) -> list[ChecklistPoint]:
    """Resolve checklist using the resolution rule:

    (category, pack_type) -> (category, '') -> generic five.
    Substitutes {reg_number} and {expiry_example}.
    """
    sql = """
        SELECT inspection_points FROM packaging_checklists
        WHERE category = %s AND variant = %s;
    """
    selected_raw: Any = None
    async with conn.cursor() as cur:
        if pack_type:
            await cur.execute(sql, (category, pack_type))
            row = await cur.fetchone()
            if row:
                selected_raw = row["inspection_points"]

        if not selected_raw:
            await cur.execute(sql, (category, ""))
            row = await cur.fetchone()
            if row:
                selected_raw = row["inspection_points"]

    if selected_raw:
        if isinstance(selected_raw, str):
            selected_raw = json.loads(selected_raw)
        points_list = selected_raw
    else:
        points_list = GENERIC_COMMON_POINTS

    # Format tokens
    reg_sub = reg_number or "the official record"
    if expires_on:
        exp_sub = expires_on.strftime("%m/%Y")
    else:
        exp_sub = "06/2027"

    resolved: list[ChecklistPoint] = []
    for p in points_list:
        detail = p["detail"].replace("{reg_number}", reg_sub).replace("{expiry_example}", exp_sub)
        resolved.append(
            ChecklistPoint(
                key=p["key"],
                label=p["label"],
                detail=detail,
                kind=p.get("kind", "common"),
            )
        )

    # Sort common before specific
    resolved.sort(key=lambda pt: 0 if pt.kind == "common" else 1)
    return resolved


async def get_alerts_list(
    conn: AsyncConnection[dict[str, Any]],
    active_only: bool = True,
    limit: int = 20,
) -> list[AlertSummary]:
    sql = """
        SELECT id, alert_reference_no, title, product_name, batch_numbers,
               summary, official_source_url, issued_date, is_active
        FROM safety_alerts
        WHERE (%s IS FALSE OR is_active = TRUE)
        ORDER BY issued_date DESC
        LIMIT %s;
    """
    async with conn.cursor() as cur:
        await cur.execute(sql, (active_only, limit))
        rows = await cur.fetchall()

    return [
        AlertSummary(
            id=r["id"],
            alert_reference_no=r["alert_reference_no"],
            title=r.get("title"),
            product_name=r["product_name"],
            batch_numbers=r.get("batch_numbers"),
            summary=r["summary"],
            official_source_url=r["official_source_url"],
            issued_date=r["issued_date"],
            is_active=r["is_active"],
        )
        for r in rows
    ]


async def get_meta_info(
    conn: AsyncConnection[dict[str, Any]],
) -> dict[str, Any]:
    sql = """
        SELECT count(*) AS total_products,
               max(last_synced_at) AS max_synced
        FROM products;
    """
    alerts_sql = "SELECT count(*) FROM safety_alerts WHERE is_active = TRUE;"
    cats_sql = "SELECT DISTINCT category FROM products;"

    async with conn.cursor() as cur:
        await cur.execute(sql)
        p_row = await cur.fetchone()
        await cur.execute(alerts_sql)
        a_row = await cur.fetchone()
        await cur.execute(cats_sql)
        c_rows = await cur.fetchall()

    db_cats = [r["category"] for r in c_rows]
    coverage: list[str] = []
    for db_c in db_cats:
        ui_c = DB_TO_UI_CATEGORY.get(db_c)
        if ui_c and ui_c not in coverage:
            coverage.append(ui_c)

    # Sort coverage in standard display order
    order = ["Food", "Drinks", "Care", "Meds"]
    coverage.sort(key=lambda x: order.index(x) if x in order else 99)

    return {
        "disclaimer": (
            "CheckAm reports what the NAFDAC public registry shows. "
            "It does not decide whether a product is genuine. "
            "Inspect the pack yourself and contact NAFDAC directly for enforcement."
        ),
        "coverage": coverage,
        "product_count": p_row["total_products"] if p_row else 0,
        "alert_count": a_row["count"] if a_row else 0,
        "last_synced_at": p_row["max_synced"].isoformat() if p_row and p_row["max_synced"] else "",
        "version": "2026.11",
    }
