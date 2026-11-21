import asyncio
import time

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_concurrent_search_latency_gate(client: AsyncClient) -> None:
    queries = [
        "paracetamol",
        "water",
        "milo",
        "milk",
        "chivita",
        "01-4721",
        "flour",
        "rice",
        "oil",
        "orange",
        "syrup",
        "capsule",
        "tablet",
        "dettol",
        "soap",
        "eva",
        "semovita",
        "indomie",
        "golden",
        "amala",
    ]

    latencies_ms: list[float] = []

    async def fetch(q: str) -> None:
        t0 = time.perf_counter()
        res = await client.get(f"/search?q={q}")
        t1 = time.perf_counter()
        assert res.status_code == 200
        latencies_ms.append((t1 - t0) * 1000.0)

    # Run 20 concurrent search requests
    await asyncio.gather(*(fetch(q) for q in queries))

    latencies_ms.sort()
    p95_idx = int(0.95 * len(latencies_ms))
    p95 = latencies_ms[p95_idx]

    # Verify p95 latency is strictly under 300ms
    assert p95 < 300.0, f"p95 {p95:.2f} ms exceeded 300 ms limit!"
