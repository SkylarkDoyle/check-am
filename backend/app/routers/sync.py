import gzip
import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Header, Response, status

from app.cache import get_cache
from app.db import get_db_connection
from app.queries import (
    get_alerts_list,
    get_all_checklists,
    get_meta_info,
    map_row_to_summary,
)
from app.schemas import SyncManifest

router = APIRouter(tags=["sync"])


async def build_bundle_data() -> tuple[bytes, str, dict[str, Any], int, int]:
    """Build gzipped JSON bundle and return:

    (gzipped_bytes, sha256, bundle_dict, product_count, alert_count).
    """
    async with get_db_connection() as conn:
        # 1. Fetch all products
        sql = """
            SELECT id, nafdac_reg_num, normalized_reg_num, product_name, brand_name,
                   category, pack_type, pack_size, dosage_form, manufacturer,
                   status, registered_on, expires_on, external_image_url,
                   source_portal, last_synced_at
            FROM products
            ORDER BY product_name ASC;
        """
        async with conn.cursor() as cur:
            await cur.execute(sql)
            p_rows = await cur.fetchall()

        products = [map_row_to_summary(r).model_dump(mode="json") for r in p_rows]

        # 2. Fetch alerts
        alerts_list = await get_alerts_list(conn, active_only=False, limit=500)
        alerts = [a.model_dump(mode="json") for a in alerts_list]

        # 3. Fetch checklists
        checklists_list = await get_all_checklists(conn)
        checklists = [c.model_dump(mode="json") for c in checklists_list]

        # 4. Fetch meta
        meta = await get_meta_info(conn)

    now_iso = datetime.now(UTC).isoformat()
    bundle_dict = {
        "version": meta.get("version", "2026.11"),
        "generated_at": now_iso,
        "product_count": len(products),
        "alert_count": len(alerts),
        "products": products,
        "alerts": alerts,
        "checklists": checklists,
        "meta": meta,
    }

    raw_json = json.dumps(bundle_dict, separators=(",", ":")).encode("utf-8")
    gz_bytes = gzip.compress(raw_json, compresslevel=6)
    sha256 = hashlib.sha256(gz_bytes).hexdigest()

    return gz_bytes, sha256, bundle_dict, len(products), len(alerts)


@router.get("/sync/manifest", response_model=SyncManifest)
async def get_manifest(
    if_none_match: str | None = Header(default=None),
) -> Response:
    cache = get_cache()
    cached_manifest = await cache.get("sync:manifest")

    if not cached_manifest:
        gz_bytes, sha256, bundle_dict, p_cnt, a_cnt = await build_bundle_data()
        now_iso = bundle_dict["generated_at"]
        manifest_data = {
            "version": bundle_dict["version"],
            "generated_at": now_iso,
            "product_count": p_cnt,
            "alert_count": a_cnt,
            "bytes": len(gz_bytes),
            "sha256": sha256,
        }
        await cache.set("sync:manifest", manifest_data, ttl_seconds=600)
        await cache.set(f"sync:bundle:{sha256}", gz_bytes, ttl_seconds=3600)
    else:
        manifest_data = cached_manifest
        sha256 = manifest_data["sha256"]

    etag = f'"{sha256}"'
    if if_none_match and if_none_match.strip('"') == sha256:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    return Response(
        content=json.dumps(manifest_data),
        media_type="application/json",
        headers={"ETag": etag, "Cache-Control": "public, max-age=300"},
    )


@router.get("/sync-bundle")
async def get_sync_bundle(
    if_none_match: str | None = Header(default=None),
) -> Response:
    cache = get_cache()
    cached_manifest = await cache.get("sync:manifest")

    if cached_manifest:
        sha256 = cached_manifest["sha256"]
        gz_bytes = await cache.get(f"sync:bundle:{sha256}")
    else:
        gz_bytes = None
        sha256 = None

    if gz_bytes is None:
        gz_bytes, sha256, bundle_dict, p_cnt, a_cnt = await build_bundle_data()
        manifest_data = {
            "version": bundle_dict["version"],
            "generated_at": bundle_dict["generated_at"],
            "product_count": p_cnt,
            "alert_count": a_cnt,
            "bytes": len(gz_bytes),
            "sha256": sha256,
        }
        await cache.set("sync:manifest", manifest_data, ttl_seconds=600)
        await cache.set(f"sync:bundle:{sha256}", gz_bytes, ttl_seconds=3600)

    etag = f'"{sha256}"'
    if if_none_match and if_none_match.strip('"') == sha256:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    return Response(
        content=gz_bytes,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "ETag": etag,
            "Cache-Control": "public, max-age=3600",
        },
    )
