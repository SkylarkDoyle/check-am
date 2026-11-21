from fastapi import APIRouter, Query

from app.db import get_db_connection
from app.queries import get_all_checklists, resolve_product_checklist
from app.schemas import ChecklistPoint, ChecklistResponse

router = APIRouter(prefix="/checklists", tags=["checklists"])


@router.get("", response_model=list[ChecklistResponse])
async def list_checklists() -> list[ChecklistResponse]:
    async with get_db_connection() as conn:
        return await get_all_checklists(conn)


@router.get("/resolve", response_model=list[ChecklistPoint])
async def resolve_checklist(
    category: str = Query(...),
    pack_type: str | None = None,
    reg_number: str | None = None,
) -> list[ChecklistPoint]:
    async with get_db_connection() as conn:
        return await resolve_product_checklist(
            conn,
            category=category,
            pack_type=pack_type,
            reg_number=reg_number,
        )
