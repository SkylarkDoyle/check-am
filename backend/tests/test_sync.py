import gzip
import json

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_manifest(client: AsyncClient) -> None:
    res = await client.get("/sync/manifest")
    assert res.status_code == 200
    manifest = res.json()
    assert "version" in manifest
    assert "product_count" in manifest
    assert manifest["product_count"] >= 3600
    assert "alert_count" in manifest
    assert manifest["alert_count"] >= 14
    assert "sha256" in manifest
    assert "bytes" in manifest
    assert manifest["bytes"] > 0
    assert "ETag" in res.headers


@pytest.mark.asyncio
async def test_manifest_etag_304(client: AsyncClient) -> None:
    res1 = await client.get("/sync/manifest")
    etag = res1.headers["ETag"]

    res2 = await client.get("/sync/manifest", headers={"If-None-Match": etag})
    assert res2.status_code == 304


@pytest.mark.asyncio
async def test_get_sync_bundle(client: AsyncClient) -> None:
    res = await client.get("/sync-bundle")
    assert res.status_code == 200
    assert "ETag" in res.headers

    # Content is gzipped json
    raw_content = res.content
    try:
        decompressed = gzip.decompress(raw_content)
        data = json.loads(decompressed.decode("utf-8"))
    except Exception:
        # httpx might automatically decompress gzip content
        data = json.loads(raw_content.decode("utf-8"))

    assert "products" in data
    assert len(data["products"]) >= 3600
    assert "alerts" in data
    assert len(data["alerts"]) >= 14
    assert "checklists" in data
    assert len(data["checklists"]) >= 14


@pytest.mark.asyncio
async def test_meta_endpoint(client: AsyncClient) -> None:
    res = await client.get("/meta")
    assert res.status_code == 200
    data = res.json()
    assert "version" in data
    assert data["product_count"] >= 3600
    assert data["alert_count"] >= 14
    assert "coverage" in data
    assert "Food" in data["coverage"]
    assert "Meds" in data["coverage"]
    assert "disclaimer" in data
