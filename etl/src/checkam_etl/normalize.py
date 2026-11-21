import re

_REG_STRIP = re.compile(r"[^A-Za-z0-9]")
_DASH_RE = re.compile(r"[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]")
_WS_RE = re.compile(r"\s+")

# Registration numbers like "Aug-67" / "Jan-09" are spreadsheet date-mangling artefacts in the
# source data (real NAFDAC numbers are digits or a letter+digit prefix, never a month name).
_DATE_MANGLED_RE = re.compile(
    r"^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[-\s]?\d+$", re.IGNORECASE
)

VALID_CATEGORIES = {"Food", "Beverage", "Toothpaste", "Cosmetic", "OTC"}


def normalize_reg(value: str) -> str:
    """Mirror of the SQL generated column."""
    if not value:
        return ""
    return _REG_STRIP.sub("", value).upper()


def clean_reg_display(value: str) -> str:
    """Trim, collapse whitespace, replace unicode en/em dashes with standard '-'."""
    if not value:
        return ""
    # Replace unicode dash variants with ASCII '-'
    cleaned = _DASH_RE.sub("-", value)
    # Collapse multiple whitespaces
    cleaned = _WS_RE.sub(" ", cleaned).strip()
    # Normalize internal spaces around hyphen, e.g. "01 - 4582" -> "01-4582"
    cleaned = re.sub(r"\s*-\s*", "-", cleaned)
    # If there is space separating parts without hyphen, e.g. "01 4582" -> "01-4582"
    if " " in cleaned and "-" not in cleaned:
        cleaned = cleaned.replace(" ", "-")
    return cleaned.upper()


def is_date_mangled_reg(value: str) -> bool:
    """True for month-name style numbers such as 'Aug-67' that were corrupted upstream."""
    return bool(value) and bool(_DATE_MANGLED_RE.match(clean_reg_display(value)))


def validate_reg_num(value: str) -> str | None:
    """Validate and return cleaned registration number, or None if invalid or >50 chars."""
    cleaned = clean_reg_display(value)
    if not cleaned or len(cleaned) > 50:
        return None
    if is_date_mangled_reg(cleaned):
        return None
    # Must contain at least one alphanumeric character
    if not normalize_reg(cleaned):
        return None
    return cleaned


def map_category(raw_label: str, mapping: dict[str, str]) -> str | None:
    """Map a portal's category label to one of the 5 allowed categories."""
    if not raw_label:
        return None
    raw_key = raw_label.strip().lower()
    for pattern, target in mapping.items():
        if pattern.strip().lower() == raw_key:
            if target in VALID_CATEGORIES:
                return target
    # If the raw label is already one of the exact categories
    for cat in VALID_CATEGORIES:
        if raw_key == cat.lower():
            return cat
    return None


def derive_pack_type(raw_text: str | None) -> str | None:
    """Deterministically map presentation/form text to a controlled pack_type."""
    if not raw_text:
        return None
    val = raw_text.strip().lower()
    if not val or val in ("n/a", "none", "null", "-", "na"):
        return None
    if "glass" in val and "bottle" in val:
        return "glass_bottle"
    if "pet" in val:
        return "pet_bottle"
    if "sachet" in val or "pouch" in val:
        return "sachet"
    if "tin" in val or "can" in val:
        return "tin"
    if "tablet" in val or "tab" in val or "caplet" in val:
        return "tablet"
    if "capsule" in val:
        return "capsule"
    if "syrup" in val or "linctus" in val or "elixir" in val:
        return "syrup"
    if "suspension" in val:
        return "suspension"
    if "cream" in val or "ointment" in val or "gel" in val:
        return "cream"
    if "injection" in val or "infusion" in val:
        return "injection"
    if "bottle" in val:
        return "pet_bottle"
    if "nylon" in val or "roll" in val:
        return "nylon"
    if "plastic" in val or "jar" in val or "container" in val:
        return "plastic_container"
    return None
