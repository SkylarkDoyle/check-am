from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.settings import settings

_pool: AsyncConnectionPool[AsyncConnection[dict[str, Any]]] | None = None


async def init_pool() -> AsyncConnectionPool[AsyncConnection[dict[str, Any]]]:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            conninfo=settings.conn_url,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            open=False,
            connection_class=AsyncConnection,
            # prepare_threshold=None: safe behind Neon's PgBouncer (-pooler) endpoint.
            kwargs={"row_factory": dict_row, "prepare_threshold": None},
            # Neon suspends idle compute and drops connections: test on checkout,
            # and retire idle ones before the server does.
            check=AsyncConnectionPool.check_connection,
            max_idle=240,
        )
        await _pool.open()
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> AsyncConnectionPool[AsyncConnection[dict[str, Any]]]:
    if _pool is None:
        raise RuntimeError("Database connection pool is not initialized")
    return _pool


@asynccontextmanager
async def get_db_connection() -> AsyncIterator[AsyncConnection[dict[str, Any]]]:
    pool = get_pool()
    async with pool.connection() as conn:
        yield conn
