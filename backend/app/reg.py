import re

_REG_STRIP = re.compile(r"[^A-Za-z0-9]")
_DASH_RE = re.compile(r"[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]")


def normalize_reg(value: str) -> str:
    """Exact parity mirror of the SQL generated column:

    regexp_replace(upper(nafdac_reg_num), '[^A-Z0-9]', '', 'g')
    """
    if not value:
        return ""
    return _REG_STRIP.sub("", value).upper()


def clean_reg_display(value: str) -> str:
    """Trim, collapse whitespace, replace unicode dashes with '-'."""
    if not value:
        return ""
    cleaned = _DASH_RE.sub("-", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"\s*-\s*", "-", cleaned)
    if " " in cleaned and "-" not in cleaned:
        cleaned = cleaned.replace(" ", "-")
    return cleaned.upper()


def looks_like_reg(query: str) -> bool:
    """Determine if a query looks like a registration number query:

    Contains at least one digit and between 3 and 20 alphanumeric characters.
    """
    if not query:
        return False
    norm = normalize_reg(query)
    if not (3 <= len(norm) <= 20):
        return False
    return any(c.isdigit() for c in norm)
