import asyncio
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import close_pool, init_pool
from app.routers import (
    ai_lookup,
    alerts,
    checklists,
    feedback,
    health,
    meta,
    products,
    search,
    sync,
)
from app.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: Initialize Postgres pool
    await init_pool()
    yield
    # Shutdown: Close Postgres pool
    await close_pool()


app = FastAPI(
    title="CheckAm API",
    description="Nigerian Product Registry & Pack Verification API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# 1. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# 2. Security Headers & Request Timing Middleware
@app.middleware("http")
async def add_security_headers_and_privacy(request: Request, call_next):  # type: ignore[no-untyped-def]
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    return response


# 3. Standardized Error Handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": f"HTTP_{exc.status_code}", "message": str(exc.detail)}},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    first_err = exc.errors()[0] if exc.errors() else {"msg": "Validation error", "loc": []}
    loc_str = ".".join(str(x) for x in first_err.get("loc", []))
    msg = f"{first_err.get('msg', 'Validation error')} for {loc_str}"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": {"code": "VALIDATION_ERROR", "message": msg}},
    )


# 4. Mount Routers
# Root-level probes
app.include_router(health.router)

# Versioned API routes under /api/v1
api_v1 = FastAPI(title="CheckAm API v1")
api_v1.include_router(health.router)
api_v1.include_router(products.router)
api_v1.include_router(search.router)
api_v1.include_router(alerts.router)
api_v1.include_router(checklists.router)
api_v1.include_router(sync.router)
api_v1.include_router(meta.router)
api_v1.include_router(ai_lookup.router)
api_v1.include_router(feedback.router)

app.mount("/api/v1", api_v1)

# Also mount un-prefixed routers on root app for direct access (e.g. /search, /products, etc.)
app.include_router(products.router)
app.include_router(search.router)
app.include_router(alerts.router)
app.include_router(checklists.router)
app.include_router(sync.router)
app.include_router(meta.router)
app.include_router(ai_lookup.router)
app.include_router(feedback.router)
