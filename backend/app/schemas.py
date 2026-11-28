from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Mapping functions between DB and API representation
DB_TO_API_STATUS = {
    "Active": "match",
    "Expired": "lapsed",
    "Alert_Flagged": "alert",
}

DB_TO_UI_CATEGORY = {
    "Food": "Food",
    "Beverage": "Drinks",
    "Toothpaste": "Care",
    "Cosmetic": "Care",
    "OTC": "Meds",
}

UI_TO_DB_CATEGORY = {
    "Food": ["Food"],
    "Drinks": ["Beverage"],
    "Care": ["Toothpaste", "Cosmetic"],
    "Meds": ["OTC"],
}

ApiStatus = Literal["match", "lapsed", "alert"]
UiCategory = Literal["Food", "Drinks", "Care", "Meds"]


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ChecklistPoint(BaseModel):
    key: str
    label: str
    detail: str
    kind: Literal["common", "specific"]


class ChecklistResponse(BaseModel):
    category: str
    variant: str
    expected_reg_prefix: str
    points: list[ChecklistPoint]


class AlertSummary(BaseModel):
    id: UUID
    alert_reference_no: str
    title: str | None = None
    product_name: str
    batch_numbers: str | None = None
    summary: str
    official_source_url: str
    issued_date: date
    is_active: bool


class ProductSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reg_number: str
    reg_normalized: str
    name: str
    brand: str | None = None
    category: UiCategory
    category_raw: str
    pack_type: str | None = None
    pack_size: str | None = None
    dosage_form: str | None = None
    manufacturer: str
    status: ApiStatus
    registered_on: date | None = None
    expires_on: date | None = None
    image_url: str | None = None
    source: str
    last_synced_at: datetime


class ProductDetail(ProductSummary):
    alerts: list[AlertSummary] = Field(default_factory=list)
    checklist: list[ChecklistPoint] = Field(default_factory=list)


class ProductSearchResult(ProductSummary):
    match_type: Literal["reg_exact", "reg_prefix", "name", "maker"]
    similarity: float | None = None


class SearchResponse(BaseModel):
    items: list[ProductSearchResult]
    total: int


class LookupResponse(BaseModel):
    result: Literal["match", "multiple", "not_found"]
    products: list[ProductSummary]


class ProductsFeedResponse(BaseModel):
    items: list[ProductSummary]
    next_cursor: str | None = None
    has_more: bool


class SyncManifest(BaseModel):
    version: str
    generated_at: str
    product_count: int
    alert_count: int
    bytes: int
    sha256: str


class MetaResponse(BaseModel):
    ai_lookup_enabled: bool = False
    disclaimer: str
    coverage: list[str]
    product_count: int
    alert_count: int
    last_synced_at: str
    version: str


class AiLookupRequest(BaseModel):
    q: str = Field(min_length=1, max_length=200)


class FeedbackContext(BaseModel):
    # Lengths are checked by the router so the error uses the API's own {"error": ...} shape.
    screen: str | None = None
    reg_number: str | None = None
    query: str | None = None
    app_version: str | None = None


class FeedbackRequest(BaseModel):
    kind: Literal["bug", "wrong_data", "idea", "other", "helpful_yes", "helpful_no"]
    message: str | None = None
    contact: str | None = None
    context: FeedbackContext | None = None
    website: str | None = None  # honeypot: real users leave it empty


class AiUsage(BaseModel):
    limit: int
    remaining: int
    resets_at: str


class AiUsageResponse(AiUsage):
    enabled: bool


class AiLookupResponse(BaseModel):
    query: str
    result: Literal["ok", "none"]
    cached: bool
    generated_at: str | None = None
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    usage: AiUsage
    disclaimer: str = "AI responses may include mistakes."
