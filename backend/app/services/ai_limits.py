"""Daily usage counters for the AI lookup.

There are no accounts, so "per user" means an anonymous device id (a random UUID made in the
browser). It is a fair-use limit, not a hard one: clearing site data starts a new id. The IP and
global counters are the backstops that actually protect the SerpApi quota.

Days follow Nigerian time (UTC+1, no daylight saving) so "left today" matches what people see.
Counts are reserved before a paid call and refunded when it fails or finds nothing.
"""

import hashlib
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

from psycopg import AsyncConnection

from app.settings import settings

WAT = timezone(timedelta(hours=1))


def today() -> date:
    return datetime.now(WAT).date()


def resets_at() -> datetime:
    """The start of the next Nigerian day."""
    tomorrow = datetime.combine(today() + timedelta(days=1), datetime.min.time(), tzinfo=WAT)
    return tomorrow


def ip_key(ip: str) -> str:
    """A salted daily hash: the raw address is never stored."""
    return hashlib.sha256(f"{settings.ai_ip_salt}:{today().isoformat()}:{ip}".encode()).hexdigest()[
        :32
    ]


async def reserve(conn: AsyncConnection[dict[str, Any]], scope: str, key: str, limit: int) -> bool:
    """Atomically count one use. False when the limit for today is already reached."""
    if limit <= 0:
        return False
    async with conn.transaction():
        cur = await conn.execute(
            "INSERT INTO ai_usage (scope, key, day, count) VALUES (%s, %s, %s, 1) "
            "ON CONFLICT (scope, key, day) DO UPDATE SET count = ai_usage.count + 1 "
            "WHERE ai_usage.count < %s RETURNING count",
            (scope, key, today(), limit),
        )
        row = await cur.fetchone()
    return row is not None


async def refund(conn: AsyncConnection[dict[str, Any]], scope: str, key: str) -> None:
    async with conn.transaction():
        await conn.execute(
            "UPDATE ai_usage SET count = GREATEST(count - 1, 0) "
            "WHERE scope = %s AND key = %s AND day = %s",
            (scope, key, today()),
        )


async def used(conn: AsyncConnection[dict[str, Any]], scope: str, key: str) -> int:
    cur = await conn.execute(
        "SELECT count FROM ai_usage WHERE scope = %s AND key = %s AND day = %s",
        (scope, key, today()),
    )
    row = await cur.fetchone()
    return int(row["count"]) if row else 0


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()
