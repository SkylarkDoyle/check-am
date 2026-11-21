import html
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from checkam_etl.db import (
    ProductRow,
    dedupe_products,
    get_db_connection,
    prune_stale_products,
    upsert_products_batch,
)
from checkam_etl.http import CheckAmHttpClient
from checkam_etl.normalize import (
    derive_pack_type,
    is_date_mangled_reg,
    map_category,
    validate_reg_num,
)
from checkam_etl.run_report import RunReport


def _parse_date(date_str: str | None) -> datetime | None:
    if not date_str or not date_str.strip():
        return None
    cleaned = date_str.strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=UTC)
        except ValueError:
            pass
    return None


def _determine_status(expiry_str: str | None) -> str:
    exp_date = _parse_date(expiry_str)
    if exp_date is None:
        return "Active"
    now_utc = datetime.now(UTC)
    if exp_date < now_utc:
        return "Expired"
    return "Active"


async def ingest_food_db(
    limit: int | None = None,
    config_path: Path | None = None,
    use_cache: bool = True,
    prune: bool = False,
) -> RunReport:
    report = RunReport(source="food_db")
    cfg_file = config_path or (
        Path(__file__).resolve().parent.parent.parent.parent / "config" / "portals.yaml"
    )
    with open(cfg_file, encoding="utf-8") as f:
        config = yaml.safe_load(f)["food_db"]

    http = CheckAmHttpClient()
    try:
        # 1. Fetch main page to obtain public nonce
        main_resp = await http.get(config["url"], use_cache=use_cache)
        nonce_match = re.search(
            r'ninja_table_public_nonce["\']\s*:\s*["\']([a-f0-9]+)["\']', main_resp.text
        )
        if not nonce_match:
            nonce_match = re.search(r"ninja_table_public_nonce=([a-f0-9]+)", main_resp.text)
        nonce = nonce_match.group(1) if nonce_match else "d48c5c6f87"

        # 2. Fetch data via Ninja Tables public action
        params = {
            "action": "wp_ajax_ninja_tables_public_action",
            "table_id": config["table_id"],
            "target_action": "get-all-data",
            "default_sorting": "old_first",
            "skip_rows": "0",
            "limit_rows": "0",
            "ninja_table_public_nonce": nonce,
            "chunk_number": "0",
        }
        ajax_resp = await http.get(config["ajax_url"], params=params, use_cache=use_cache)
        items: list[dict[str, Any]] = ajax_resp.json()
        report.fetched = len(items)

        category_map = config.get("category_map", {})
        valid_rows: list[ProductRow] = []

        for item in items:
            val: dict[str, Any] = item.get("value", {})
            raw_reg = val.get("nafdacnumber")
            raw_name = val.get("productname")
            raw_cat = val.get("subcategory") or val.get("category") or "Food"
            raw_mfr = val.get("manufacturer") or val.get("applicantname") or "Unknown"
            raw_issue = val.get("issuedate")
            raw_expiry = val.get("expirydate")
            raw_packsize = val.get("packsize")
            raw_presentation = val.get("presentation")

            if not raw_reg or not raw_name:
                report.rejected += 1
                continue

            if is_date_mangled_reg(str(raw_reg)):
                report.rejected += 1
                report.rejected_corrupt_reg += 1
                continue
            cleaned_reg = validate_reg_num(str(raw_reg))
            if not cleaned_reg:
                report.rejected += 1
                continue

            target_cat = map_category(str(raw_cat), category_map)
            if not target_cat:
                report.skipped_category += 1
                continue

            status = _determine_status(raw_expiry)
            dt_issue = _parse_date(str(raw_issue)) if raw_issue else None
            dt_exp = _parse_date(str(raw_expiry)) if raw_expiry else None
            pack_t = derive_pack_type(str(raw_presentation)) if raw_presentation else None
            pack_s = str(raw_packsize).strip()[:120] if raw_packsize else None

            row = ProductRow(
                nafdac_reg_num=cleaned_reg,
                product_name=html.unescape(str(raw_name)).strip()[:255],
                brand_name=None,  # the portal has no brand column; never fake one
                category=target_cat,
                manufacturer=html.unescape(str(raw_mfr)).strip()[:255],
                status=status,
                external_image_url=None,
                source_portal="FoodDB",
                registered_on=dt_issue.date() if dt_issue else None,
                expires_on=dt_exp.date() if dt_exp else None,
                pack_type=pack_t,
                pack_size=pack_s,
            )
            valid_rows.append(row)
            if limit and len(valid_rows) >= limit:
                break

        report.parsed = len(valid_rows)
        valid_rows, report.duplicates_collapsed, report.shared_reg_numbers = dedupe_products(
            valid_rows
        )

        # 3. Batch upsert into PostgreSQL
        if valid_rows:
            with get_db_connection() as conn:
                inserted, updated = upsert_products_batch(valid_rows, conn)
                report.inserted = inserted
                report.updated = updated
                if prune and not limit and not report.errors:
                    report.pruned = prune_stale_products(
                        conn, "FoodDB", report.started, len(valid_rows)
                    )

    except Exception as e:
        report.errors.append(f"{type(e).__name__}: {str(e)}")
    finally:
        await http.close()
        report.complete()

    return report
