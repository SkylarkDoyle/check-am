import hashlib
import logging
import re
from typing import Any

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.db import get_db_connection
from app.routers.ai_lookup import ApiError, _client_ip
from app.schemas import FeedbackRequest
from app.settings import settings

router = APIRouter(prefix="/feedback", tags=["feedback"])
# Never log message, contact, device id or IP: only the kind and counts.
log = logging.getLogger(__name__)

_DEVICE_ID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_SPACES = re.compile(r"\s+")
_LINK = re.compile(r"https?://", re.IGNORECASE)

NEEDS_MESSAGE = {"bug", "wrong_data", "idea", "other"}
MAX_LINKS = 3
DUPLICATE_WINDOW_MINUTES = 10


def _error(code: str, message: str, http_status: int) -> ApiError:
    return ApiError(code, message, http_status)


def _hash(kind: str, value: str) -> str:
    return hashlib.sha256(f"{settings.ai_ip_salt}:{kind}:{value}".encode()).hexdigest()[:32]


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = _SPACES.sub(" ", _CONTROL.sub(" ", value)).strip()
    return text or None


def _limit(value: str | None, size: int) -> str | None:
    if value is not None and len(value.strip()) > size:
        raise _error("FEEDBACK_INVALID", "Some text is too long.", 400)
    return _clean(value)


@router.post("", status_code=201)
async def submit_feedback(
    request: Request,
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
) -> Any:
    try:
        return await _submit(request, x_device_id)
    except ApiError as err:
        return err.response()


async def _submit(request: Request, x_device_id: str | None) -> JSONResponse:
    if not x_device_id or not _DEVICE_ID.match(x_device_id):
        raise _error("FEEDBACK_DEVICE_REQUIRED", "A valid X-Device-Id header is required.", 400)
    device_hash = _hash("device", x_device_id.lower())

    try:
        body = FeedbackRequest.model_validate(await request.json())
    except (ValueError, ValidationError):
        raise _error("FEEDBACK_INVALID", "That feedback could not be read.", 400) from None

    ok = JSONResponse(status_code=201, content={"ok": True})
    if body.website and body.website.strip():
        return ok  # honeypot: pretend success, store nothing

    message = _limit(body.message, 1000)
    contact = _limit(body.contact, 120)
    ctx = body.context
    screen = _limit(ctx.screen, 40) if ctx else None
    reg_number = _limit(ctx.reg_number, 40) if ctx else None
    query = _limit(ctx.query, 120) if ctx else None
    app_version = _limit(ctx.app_version, 20) if ctx else None

    if body.kind in NEEDS_MESSAGE and (message is None or len(message) < 3):
        raise _error("FEEDBACK_MESSAGE_REQUIRED", "Please write a short message.", 400)
    if message and len(_LINK.findall(message)) > MAX_LINKS:
        raise _error("FEEDBACK_REJECTED", "That message could not be accepted.", 400)

    ip_hash = _hash("ip", _client_ip(request))
    user_agent = (request.headers.get("user-agent") or "")[:200] or None

    async with get_db_connection() as conn:
        cur = await conn.execute(
            "SELECT 1 FROM feedback WHERE device_hash = %s AND kind = %s "
            "AND message IS NOT DISTINCT FROM %s "
            "AND created_at > now() - make_interval(mins => %s) LIMIT 1",
            (device_hash, body.kind, message, DUPLICATE_WINDOW_MINUTES),
        )
        if await cur.fetchone():
            return ok

        cur = await conn.execute(
            "SELECT "
            "count(*) FILTER (WHERE device_hash = %(d)s AND created_at > now() - interval '1 hour')"
            " AS dev_hour, "
            "count(*) FILTER (WHERE device_hash = %(d)s) AS dev_day, "
            "count(*) FILTER (WHERE ip_hash = %(i)s) AS ip_day "
            "FROM feedback WHERE created_at > now() - interval '1 day' "
            "AND (device_hash = %(d)s OR ip_hash = %(i)s)",
            {"d": device_hash, "i": ip_hash},
        )
        row = await cur.fetchone() or {}
        if (
            row.get("dev_hour", 0) >= settings.feedback_limit_per_device_hour
            or row.get("dev_day", 0) >= settings.feedback_limit_per_device_day
            or row.get("ip_day", 0) >= settings.feedback_limit_per_ip_day
        ):
            raise _error(
                "FEEDBACK_RATE_LIMITED", "You have sent a lot of feedback. Try again later.", 429
            )

        await conn.execute(
            "INSERT INTO feedback (kind, message, contact, screen, reg_number, query, "
            "app_version, device_hash, ip_hash, user_agent) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                body.kind,
                message,
                contact,
                screen,
                reg_number,
                query,
                app_version,
                device_hash,
                ip_hash,
                user_agent,
            ),
        )
    log.info("feedback stored kind=%s", body.kind)
    return ok
