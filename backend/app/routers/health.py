from typing import Any

from fastapi import APIRouter, HTTPException, status
from psycopg import sql

from app.db import get_db_connection

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def readiness_check() -> dict[str, Any]:
    try:
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql.SQL("SELECT 1;"))
                row = await cur.fetchone()
                if not row:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail={
                            "error": {
                                "code": "DB_UNAVAILABLE",
                                "message": "Database ping failed",
                            }
                        },
                    )
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": {"code": "DB_ERROR", "message": str(e)}},
        ) from e
