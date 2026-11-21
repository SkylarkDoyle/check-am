from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.db import get_db_connection
from app.queries import get_alerts_list
from app.schemas import AlertSummary

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertSummary])
async def list_alerts(
    active: bool = True,
    limit: int = Query(default=20, ge=1, le=50),
) -> list[AlertSummary]:
    async with get_db_connection() as conn:
        alerts = await get_alerts_list(conn, active_only=active, limit=limit)
    return alerts


@router.get("/{alert_id}", response_model=AlertSummary)
async def get_alert(
    alert_id: UUID,
) -> AlertSummary:
    sql = """
        SELECT id, alert_reference_no, title, product_name, batch_numbers,
               summary, official_source_url, issued_date, is_active
        FROM safety_alerts
        WHERE id = %s;
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (alert_id,))
            row = await cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": f"Alert {alert_id} not found"}},
        )

    return AlertSummary(
        id=row["id"],
        alert_reference_no=row["alert_reference_no"],
        title=row.get("title"),
        product_name=row["product_name"],
        batch_numbers=row.get("batch_numbers"),
        summary=row["summary"],
        official_source_url=row["official_source_url"],
        issued_date=row["issued_date"],
        is_active=row["is_active"],
    )
