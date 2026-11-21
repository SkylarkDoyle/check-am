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
    validate_reg_num,
)
from checkam_etl.run_report import RunReport


def _parse_date(date_str: str | None) -> datetime | None:
    if not date_str or not date_str.strip():
        return None
    cleaned = date_str.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=UTC)
        except ValueError:
            pass
    return None


def _determine_status(status_str: str | None, expiry_str: str | None) -> str:
    if status_str and status_str.strip().lower() == "inactive":
        return "Expired"
    exp_date = _parse_date(expiry_str)
    if exp_date is None:
        return "Active"
    now_utc = datetime.now(UTC)
    if exp_date < now_utc:
        return "Expired"
    return "Active"


_NOTE_RE = re.compile(r"\((?:check|strength)[^)]*\)", re.IGNORECASE)


def clean_product_name(raw: str) -> str:
    """Strip the portal's UI markers (#, *, _ ) and its '(check pack size)' style annotations."""
    name = _NOTE_RE.sub("", raw).replace("#", "").replace("*", "")
    return re.sub(r"\s+", " ", name).strip(" _")


def is_otc_row(r: dict[str, Any], cfg: dict[str, Any]) -> bool:
    """Use the portal's own marketing classification, not keyword guessing.

    marketing_category_id 2 is the non-prescription class (paracetamol, ibuprofen, antacids,
    loperamide, loratadine, vitamins...), whereas prescription-only actives (amoxicillin,
    tramadol, statins, ARVs...) are all id 1. Injectable routes are always excluded.
    """
    if r.get("marketing_category_id") not in cfg.get("otc_marketing_category_ids", [2]):
        return False
    if r.get("category_name") not in cfg.get("otc_category_names", ["Drugs"]):
        return False
    route = str(r.get("route_name") or "").lower()
    return not any(term in route for term in cfg.get("excluded_routes", []))


async def ingest_greenbook(
    limit: int | None = None,
    max_pages: int = 500,
    config_path: Path | None = None,
    use_cache: bool = True,
    prune: bool = False,
) -> RunReport:
    report = RunReport(source="greenbook")
    cfg_file = config_path or (
        Path(__file__).resolve().parent.parent.parent.parent / "config" / "portals.yaml"
    )
    with open(cfg_file, encoding="utf-8") as f:
        config = yaml.safe_load(f)["greenbook"]

    endpoint = config.get("endpoint", "https://greenbook.nafdac.gov.ng")

    http = CheckAmHttpClient()
    valid_rows: list[ProductRow] = []

    try:
        start = 0
        page_length = 100
        page = 0
        prev_first_reg: str | None = None

        while True:
            params = {
                "draw": page + 1,
                "start": start,
                "length": page_length,
                "search[value]": "",
                "search[regex]": "false",
            }
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json, text/javascript, */*; q=0.01",
            }

            resp = await http.get(endpoint, params=params, headers=headers, use_cache=use_cache)
            data: dict[str, Any] = resp.json()
            records_total = data.get("recordsTotal", 0)
            rows: list[dict[str, Any]] = data.get("data", [])
            report.fetched += len(rows)

            if not rows:
                break

            # Guard against a paging bug returning the same page again (stats would be inflated)
            first_reg = str(rows[0].get("NAFDAC") or rows[0].get("nafdac_reg_num") or "")
            if first_reg and first_reg == prev_first_reg:
                report.errors.append(f"Repeated page at start={start}; aborting")
                report.fetched -= len(rows)
                break
            prev_first_reg = first_reg

            for r in rows:
                raw_name = r.get("product_name") or ""
                # Clean up any trailing ## or ** as in Greenbook frontend
                cleaned_name = clean_product_name(str(raw_name))
                if not is_otc_row(r, config):
                    report.skipped_category += 1
                    continue
                raw_reg = r.get("NAFDAC") or r.get("nafdac_reg_num")
                raw_expiry = r.get("expiry_date")
                raw_status = r.get("status")

                applicant_obj = r.get("applicant")
                applicant_name = "Unknown Maker"
                if isinstance(applicant_obj, dict):
                    applicant_name = applicant_obj.get("name", "Unknown Maker")

                if not raw_reg or not cleaned_name:
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

                raw_approval = r.get("approval_date")
                raw_form = r.get("form_name")
                raw_packsize = r.get("pack_size")

                status = _determine_status(raw_status, raw_expiry)
                dt_app = _parse_date(str(raw_approval)) if raw_approval else None
                dt_exp = _parse_date(str(raw_expiry)) if raw_expiry else None
                pack_t = derive_pack_type(str(raw_form)) if raw_form else None
                pack_s = str(raw_packsize).strip()[:120] if raw_packsize else None
                dosage_f = str(raw_form).strip()[:60] if raw_form else None

                row = ProductRow(
                    nafdac_reg_num=cleaned_reg,
                    product_name=html.unescape(cleaned_name)[:255],
                    brand_name=None,
                    category="OTC",
                    manufacturer=html.unescape(str(applicant_name)).strip()[:255],
                    status=status,
                    external_image_url=None,
                    source_portal="Greenbook",
                    registered_on=dt_app.date() if dt_app else None,
                    expires_on=dt_exp.date() if dt_exp else None,
                    pack_type=pack_t,
                    pack_size=pack_s,
                    dosage_form=dosage_f,
                )
                valid_rows.append(row)
                if limit and len(valid_rows) >= limit:
                    break

            if limit and len(valid_rows) >= limit:
                break

            start += page_length
            page += 1
            if start >= records_total:
                break
            if page >= max_pages:
                report.errors.append(
                    f"Stopped at max_pages={max_pages}; portal reports {records_total} records"
                )
                break

        report.parsed = len(valid_rows)
        valid_rows, report.duplicates_collapsed, report.shared_reg_numbers = dedupe_products(
            valid_rows
        )

        # Batch upsert
        if valid_rows:
            with get_db_connection() as conn:
                inserted, updated = upsert_products_batch(valid_rows, conn)
                report.inserted = inserted
                report.updated = updated
                if prune and not limit and not report.errors:
                    report.pruned = prune_stale_products(
                        conn, "Greenbook", report.started, len(valid_rows)
                    )

    except Exception as e:
        report.errors.append(f"{type(e).__name__}: {str(e)}")
    finally:
        await http.close()
        report.complete()

    return report
