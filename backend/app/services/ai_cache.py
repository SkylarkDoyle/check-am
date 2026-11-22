"""Postgres cache of AI answers. Not memory: FastAPI Cloud scales to zero and forgets memory."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from psycopg import AsyncConnection


async def get_cached(conn: AsyncConnection[dict[str, Any]], key: str) -> dict[str, Any] | None:
    """A live cached answer ({'status', 'result', 'created_at'}), or None. Counts the hit."""
    async with conn.transaction():
        cur = await conn.execute(
            "UPDATE ai_lookups SET hit_count = hit_count + 1 "
            "WHERE query_key = %s AND expires_at > now() "
            "RETURNING status, result, created_at",
            (key,),
        )
        row = await cur.fetchone()
    if not row:
        return None
    result = row["result"]
    if isinstance(result, str):
        result = json.loads(result)
    return {"status": row["status"], "result": result, "created_at": row["created_at"]}


async def put_cached(
    conn: AsyncConnection[dict[str, Any]],
    key: str,
    query_text: str,
    status: str,
    result: dict[str, Any],
    ttl_days: float,
    version: int,
) -> None:
    expires = datetime.now(UTC) + timedelta(days=ttl_days)
    async with conn.transaction():
        await conn.execute(
            "INSERT INTO ai_lookups "
            "(query_key, query_text, prompt_version, status, result, expires_at) "
            "VALUES (%s, %s, %s, %s, %s::jsonb, %s) "
            "ON CONFLICT (query_key) DO UPDATE SET query_text = EXCLUDED.query_text, "
            "prompt_version = EXCLUDED.prompt_version, status = EXCLUDED.status, "
            "result = EXCLUDED.result, created_at = now(), expires_at = EXCLUDED.expires_at",
            (key, query_text, version, status, json.dumps(result), expires),
        )
