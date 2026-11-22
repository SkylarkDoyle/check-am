"""Query building and candidate scoring for product image enrichment.

Pure functions only (no network, no database) so they are fully unit-testable.
Precision first: a wrong photo beside a NAFDAC record is worse than no photo.
"""

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from checkam_etl.imagesearch.base import Candidate

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent.parent / "config" / "image_match.yaml"

_PAREN_RE = re.compile(r"\([^)]*\)|\[[^\]]*\]")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_PACK_TOKEN_RE = re.compile(r"^\d+([.,]\d+)?(g|kg|mg|mcg|ml|cl|l|iu|pcs|pc|s|x\d+)?$")
OTC_CATEGORY = "OTC"


@dataclass(frozen=True)
class MatchConfig:
    threshold: float
    min_short_side: int
    good_short_side: int
    max_aspect_ratio: float
    min_name_fraction: float
    weights: dict[str, float]
    penalties: dict[str, float]
    blocked_domains: tuple[str, ...]
    negative_words: tuple[str, ...]
    retail_hints: tuple[str, ...]
    generic_words: frozenset[str]
    generic_company_words: frozenset[str]


@lru_cache(maxsize=4)
def load_match_config(path: str | None = None) -> MatchConfig:
    cfg_path = Path(path) if path else DEFAULT_CONFIG
    with open(cfg_path, encoding="utf-8") as f:
        raw: dict[str, Any] = yaml.safe_load(f)
    return MatchConfig(
        threshold=float(raw["threshold"]),
        min_short_side=int(raw["min_short_side"]),
        good_short_side=int(raw["good_short_side"]),
        max_aspect_ratio=float(raw["max_aspect_ratio"]),
        min_name_fraction=float(raw["min_name_fraction"]),
        weights={k: float(v) for k, v in raw["weights"].items()},
        penalties={k: float(v) for k, v in raw["penalties"].items()},
        blocked_domains=tuple(str(d).lower() for d in raw["blocked_domains"]),
        negative_words=tuple(str(w).lower() for w in raw["negative_words"]),
        retail_hints=tuple(str(w).lower() for w in raw["retail_hints"]),
        generic_words=frozenset(str(w).lower() for w in raw["generic_words"]),
        generic_company_words=frozenset(str(w).lower() for w in raw["generic_company_words"]),
    )


def _ascii_lower(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text)
    return folded.encode("ascii", "ignore").decode("ascii").lower()


def tokenize(text: str) -> list[str]:
    return [t for t in _NON_ALNUM_RE.split(_ascii_lower(text)) if t]


def clean_name(name: str) -> str:
    """Drop bracketed notes, stray symbols and annotations such as '$' or '#'."""
    no_paren = _PAREN_RE.sub(" ", name)
    words = [w for w in re.split(r"\s+", no_paren) if w]
    kept = [w for w in words if re.search(r"[A-Za-z0-9]", w)]
    return " ".join(kept).strip()


def _is_pack_token(token: str) -> bool:
    return bool(_PACK_TOKEN_RE.match(token))


def distinctive_tokens(name: str, cfg: MatchConfig) -> list[str]:
    """Words that identify the product: no generic words, pack sizes or one-letter tokens."""
    out: list[str] = []
    for token in tokenize(clean_name(name)):
        # Single letters are kept: they distinguish variants such as 'Cet-Z' or 'Vitamin A'.
        if token in cfg.generic_words or _is_pack_token(token):
            continue
        if token not in out:
            out.append(token)
    return out


def maker_tokens(manufacturer: str, cfg: MatchConfig) -> list[str]:
    out: list[str] = []
    for token in tokenize(_PAREN_RE.sub(" ", manufacturer)):
        if len(token) < 3 or token in cfg.generic_company_words:
            continue
        if token not in out:
            out.append(token)
    return out


def build_queries(name: str, manufacturer: str, cfg: MatchConfig) -> list[str]:
    """At most two queries: name + maker, then name + 'Nigeria'."""
    cleaned = clean_name(name)[:80]
    maker = " ".join(maker_tokens(manufacturer, cfg)[:3])
    queries: list[str] = []
    first = f"{cleaned} {maker}".strip()
    if first:
        queries.append(first)
    second = f"{cleaned} Nigeria".strip()
    if second and second not in queries:
        queries.append(second)
    return queries[:2]


def _domain_blocked(host: str, cfg: MatchConfig) -> bool:
    host = host.lower()
    return any(host == d or host.endswith("." + d) for d in cfg.blocked_domains)


def _token_present(token: str, words: set[str], compact: str) -> bool:
    if token in words:
        return True
    if token.endswith("s") and token[:-1] in words:
        return True
    if token + "s" in words:
        return True
    return len(token) >= 5 and token in compact


@dataclass(frozen=True)
class ScoreResult:
    score: float
    reject_reason: str | None = None

    @property
    def usable(self) -> bool:
        return self.reject_reason is None


def score_candidate(
    cand: Candidate, name: str, manufacturer: str, category: str, cfg: MatchConfig
) -> ScoreResult:
    """Score one search result against a product. Hard rules reject; otherwise 0..1."""
    image = urlparse(cand.image_url)
    if image.scheme.lower() != "https" or not image.hostname:
        return ScoreResult(0.0, "not_https")
    page_host = urlparse(cand.page_url).hostname or ""
    if _domain_blocked(image.hostname, cfg) or (page_host and _domain_blocked(page_host, cfg)):
        return ScoreResult(0.0, "blocked_domain")

    short_side: int | None = None
    aspect: float | None = None
    if cand.width and cand.height:
        short_side = min(cand.width, cand.height)
        aspect = max(cand.width, cand.height) / max(1, short_side)
        if short_side < cfg.min_short_side:
            return ScoreResult(0.0, "too_small")

    name_tokens = distinctive_tokens(name, cfg)
    if not name_tokens:
        return ScoreResult(0.0, "no_distinctive_name")
    m_tokens = maker_tokens(manufacturer, cfg)

    page_path = urlparse(cand.page_url).path
    text = f"{cand.title} {page_host} {page_path} {image.path}"
    words = set(tokenize(text))
    compact = _NON_ALNUM_RE.sub("", _ascii_lower(text))

    hits = [t for t in name_tokens if _token_present(t, words, compact)]
    name_fraction = len(hits) / len(name_tokens)
    brand = _token_present(name_tokens[0], words, compact)
    maker = bool(m_tokens) and any(_token_present(t, words, compact) for t in m_tokens)

    # Hard requirements: a generic medicine photo from another maker is the wrong product.
    if category == OTC_CATEGORY and not maker:
        return ScoreResult(0.0, "otc_needs_maker")
    if not brand:
        return ScoreResult(0.0, "brand_missing")
    if name_fraction < cfg.min_name_fraction:
        return ScoreResult(0.0, "name_mismatch")

    w, p = cfg.weights, cfg.penalties
    score = w["name_fraction"] * name_fraction + w["brand_token"]
    if maker:
        score += w["maker_token"]
    if short_side is None:
        score += w["size"] * 0.3
    elif short_side >= cfg.good_short_side:
        score += w["size"]
    else:
        score += w["size"] * 0.5
    host_and_path = f"{page_host}{page_path}{image.path}".lower()
    if any(h in host_and_path for h in cfg.retail_hints):
        score += w["retail_domain"]
    if aspect is not None and aspect > cfg.max_aspect_ratio:
        score -= p["bad_aspect"]
    title_l = cand.title.lower()
    if any(word in title_l for word in cfg.negative_words):
        score -= p["negative_word"]
    return ScoreResult(round(max(0.0, min(1.0, score)), 4))


def rank_candidates(
    candidates: list[Candidate], name: str, manufacturer: str, category: str, cfg: MatchConfig
) -> list[tuple[float, Candidate]]:
    """Usable candidates at or above the threshold, best first."""
    scored: list[tuple[float, Candidate]] = []
    for cand in candidates:
        res = score_candidate(cand, name, manufacturer, category, cfg)
        if res.usable and res.score >= cfg.threshold:
            scored.append((res.score, cand))
    scored.sort(key=lambda sc: sc[0], reverse=True)
    return scored
