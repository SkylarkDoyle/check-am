import argparse
import asyncio
import sys

from checkam_etl.db import get_db_connection
from checkam_etl.images import validate_image_url
from checkam_etl.run_report import RunReport
from checkam_etl.settings import settings
from checkam_etl.sources.alerts_pdf import ingest_public_alerts
from checkam_etl.sources.food_db import ingest_food_db
from checkam_etl.sources.greenbook import ingest_greenbook
from checkam_etl.sources.napams import ingest_napams


async def run_images_pass() -> RunReport:
    """Validate external_image_url for products that have them or find links."""
    report = RunReport(source="images")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, external_image_url FROM products WHERE external_image_url IS NOT NULL"
            )
            rows = cur.fetchall()
            report.fetched = len(rows)

            for prod_id, img_url in rows:
                is_valid = await validate_image_url(img_url)
                if not is_valid:
                    cur.execute(
                        "UPDATE products SET external_image_url = NULL WHERE id = %s", (prod_id,)
                    )
                    report.updated += 1
                else:
                    report.images_set += 1
                report.parsed += 1
            conn.commit()

    report.complete()
    return report


async def main_async() -> int:
    parser = argparse.ArgumentParser(description="CheckAm ETL CLI")
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run", help="Run ingestion")
    run_parser.add_argument(
        "--source",
        choices=["food_db", "napams", "alerts_pdf", "greenbook", "images"],
        help="Source to run",
    )
    run_parser.add_argument("--all", action="store_true", help="Run all sources in sequence")
    run_parser.add_argument(
        "--no-cache", action="store_true", help="Ignore the raw response cache (force live fetch)"
    )
    run_parser.add_argument(
        "--prune",
        action="store_true",
        help="After a complete run, delete rows of that source the portal no longer lists",
    )
    run_parser.add_argument("--limit", type=int, default=None, help="Limit number of rows")
    run_parser.add_argument(
        "--target",
        choices=["local", "neon"],
        default="local",
        help="Database to write to (default: local DATABASE_URL; neon uses NEON_DIRECT_URL)",
    )

    args = parser.parse_args()

    if args.command != "run":
        parser.print_help()
        return 1

    if args.target == "neon":
        if not settings.neon_direct_url:
            print("NEON_DIRECT_URL is not set; refusing to run against Neon.")
            return 2
        settings.database_url = settings.neon_direct_url
        print("Target database: Neon (direct connection)")

    overall_exit_code = 0

    if args.all:
        sources = ["food_db", "greenbook", "napams", "alerts_pdf", "images"]
    elif args.source:
        sources = [args.source]
    else:
        run_parser.print_help()
        return 1

    for src in sources:
        print(f"\n>>> Running ETL for source: {src} ...")
        if src == "food_db":
            rep = await ingest_food_db(
                limit=args.limit, use_cache=not args.no_cache, prune=args.prune
            )
        elif src == "greenbook":
            rep = await ingest_greenbook(
                limit=args.limit, use_cache=not args.no_cache, prune=args.prune
            )
        elif src == "napams":
            rep = await ingest_napams()
        elif src == "alerts_pdf":
            rep = await ingest_public_alerts()
        elif src == "images":
            rep = await run_images_pass()
        else:
            continue

        rep.print_and_save()

        # Fail if errors or 0 parsed (except napams and images)
        if src not in ("napams", "images") and (rep.errors or rep.parsed == 0):
            overall_exit_code = 1
        elif src != "napams" and rep.errors:
            overall_exit_code = 1

    return overall_exit_code


def main() -> None:
    code = asyncio.run(main_async())
    sys.exit(code)


if __name__ == "__main__":
    main()
