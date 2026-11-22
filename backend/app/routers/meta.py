from fastapi import APIRouter

from app.db import get_db_connection
from app.queries import get_meta_info
from app.schemas import MetaResponse
from app.settings import settings

router = APIRouter(tags=["meta"])


@router.get("/meta", response_model=MetaResponse)
async def get_meta() -> MetaResponse:
    async with get_db_connection() as conn:
        data = await get_meta_info(conn)
    return MetaResponse(**data, ai_lookup_enabled=settings.ai_enabled)
