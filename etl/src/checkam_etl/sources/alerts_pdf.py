import html
import io
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pdfplumber
import psycopg
import yaml
from bs4 import BeautifulSoup
from checkam_etl.db import get_db_connection, upsert_safety_alert
from checkam_etl.http import CheckAmHttpClient
from checkam_etl.normalize import normalize_reg
from checkam_etl.run_report import RunReport

REF_REGEX = re.compile(r"(?i)alert\s*no\.?:?\s*([0-9]{1,4}\s*/\s*20[0-9]{2})")
REG_REGEX = re.compile(r"(?i)\b([A-Za-z0-9]{2,4}\s*[-–—]\s*[0-9]{4,6}[A-Za-z]?)\b")
BATCH_REGEX = re.compile(r"(?i)batch\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9/\-]+)")


def clean_alert_text(text: str) -> str:
    """Decode entities, remove mojibake, normalize whitespace."""
    if not text:
        return ""
    cleaned = html.unescape(text)
    cleaned = cleaned.replace("\xa0", " ").replace("\ufffd", "")
    return re.sub(r"[ \t]+", " ", cleaned).strip()


def extract_product_name(title: str) -> str | None:
    """Best-effort extraction of product mention from alert title."""
    clean_t = clean_alert_text(title)
    m = re.search(
        r"(?:alert on|recall of|ban on|seizure of)\s+(?:suspected\s+)?"
        r"(?:counterfeit\s+|falsified\s+|substandard\s+)?(.+)",
        clean_t,
        re.IGNORECASE,
    )
    if m:
        candidate = m.group(1).strip()
        candidate = re.split(
            r"(?:by the|due to|in Ghana|over serious|as endorsed|pending)",
            candidate,
            flags=re.IGNORECASE,
        )[0].strip()
        if 2 <= len(candidate) <= 255:
            return candidate
    return None


def extract_clean_summary(body_text: str, fallback_title: str) -> str:
    """Extract first meaningful narrative paragraph, stripping customer service boilerplate."""
    boilerplate_tokens = [
        "customer service lines",
        "for enquiries call",
        "nafdac pr unit",
        "all rights reserved",
        "leave a reply",
        "share this",
        "related posts",
    ]
    paragraphs = [p.strip() for p in body_text.splitlines() if p.strip()]
    meaningful: list[str] = []
    for p in paragraphs:
        cleaned_p = clean_alert_text(p)
        if len(cleaned_p) < 30:
            continue
        p_lower = cleaned_p.lower()
        if any(token in p_lower for token in boilerplate_tokens):
            continue
        if cleaned_p.startswith("Home") or cleaned_p.startswith("Press Release"):
            continue
        meaningful.append(cleaned_p)
        if len(" ".join(meaningful)) >= 250:
            break

    if meaningful:
        summary = " ".join(meaningful)
        return summary[:600].strip()
    return clean_alert_text(fallback_title)[:600]


def parse_alert_ref(text: str) -> str | None:
    match = REF_REGEX.search(text)
    if not match:
        return None
    raw = match.group(1).replace(" ", "")
    parts = raw.split("/")
    if len(parts) == 2:
        num = parts[0].lstrip("0") or "0"
        return f"Alert No. {num.zfill(3)}/{parts[1]}"
    return f"Alert No. {raw}"


def parse_issued_date(text: str) -> date | None:
    cleaned = text.strip()
    # Try Month DD, YYYY e.g. August 19, 2026
    m = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})", cleaned)
    if m:
        month_str, day_str, year_str = m.groups()
        try:
            dt = datetime.strptime(f"{month_str} {day_str} {year_str}", "%B %d %Y")
            return dt.date()
        except ValueError:
            pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            pass
    return None


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract plain text from PDF using pdfplumber."""
    pages_text: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
    return "\n\n".join(pages_text)


def find_matched_reg_num(body: str, conn: psycopg.Connection[Any]) -> str | None:
    """Find any registration number in text that matches a real product in the database."""
    candidates = REG_REGEX.findall(body)
    for cand in candidates:
        norm = normalize_reg(cand)
        if not norm:
            continue
        with conn.cursor() as cur:
            cur.execute(
                "SELECT nafdac_reg_num FROM products WHERE normalized_reg_num = %s", (norm,)
            )
            row = cur.fetchone()
            if row:
                return str(row[0])
    return None


async def ingest_public_alerts(
    limit: int = 15,
    config_path: Path | None = None,
    use_cache: bool = True,
) -> RunReport:
    report = RunReport(source="alerts_pdf")
    cfg_file = config_path or (
        Path(__file__).resolve().parent.parent.parent.parent / "config" / "portals.yaml"
    )
    with open(cfg_file, encoding="utf-8") as f:
        config = yaml.safe_load(f)["alerts"]

    http = CheckAmHttpClient()
    try:
        index_url = config["index_url"]
        resp = await http.get(index_url, use_cache=use_cache)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Collect alert article links
        alert_links: list[tuple[str, str]] = []
        for a in soup.find_all("a", href=True):
            href_val = a.get("href")
            if not isinstance(href_val, str):
                continue
            href = href_val
            text = a.get_text(strip=True)
            if "public-alert" in href.lower() or "alert-no" in href.lower():
                if text and len(text) > 5 and href not in [x[0] for x in alert_links]:
                    alert_links.append((href, text))

        report.fetched = len(alert_links)

        with get_db_connection() as conn:
            for url, title in alert_links[:limit]:
                try:
                    ref_no = parse_alert_ref(title)
                    if not ref_no:
                        ref_no = parse_alert_ref(url)
                    if not ref_no:
                        report.rejected += 1
                        continue

                    # Fetch the alert page
                    post_resp = await http.get(url, use_cache=use_cache)
                    post_soup = BeautifulSoup(post_resp.text, "html.parser")

                    # Extract date from <time> tag or Released regex
                    issued_date: date | None = None
                    time_el = post_soup.find("time")
                    if time_el:
                        issued_date = parse_issued_date(time_el.get_text(strip=True))

                    # Check for PDF attachment
                    body_text = ""
                    pdf_urls: list[str] = []
                    for link in post_soup.find_all("a", href=True):
                        link_val = link.get("href")
                        if (
                            isinstance(link_val, str)
                            and link_val.endswith(".pdf")
                            and "alert" in link_val.lower()
                        ):
                            pdf_urls.append(link_val)

                    if pdf_urls:
                        try:
                            pdf_resp = await http.get(pdf_urls[0], use_cache=use_cache)
                            body_text = extract_text_from_pdf(pdf_resp.content)
                        except Exception:
                            body_text = ""

                    if not body_text:
                        # Extract text from main post content
                        content_el = post_soup.find(
                            class_=re.compile(r"post-content|entry-content")
                        )
                        if content_el:
                            body_text = content_el.get_text(separator="\n", strip=True)
                        else:
                            content_el = post_soup.find(class_=re.compile(r"content|entry|post"))
                            if content_el:
                                body_text = content_el.get_text(separator="\n", strip=True)
                            else:
                                body_text = post_soup.get_text(separator="\n", strip=True)

                    if not issued_date:
                        date_match = re.search(
                            r"Released:\s*([A-Za-z]+\s+\d{1,2},?\s+20\d{2})", body_text
                        )
                        if not date_match:
                            date_match = re.search(r"([A-Za-z]+\s+\d{1,2},?\s+20\d{2})", body_text)
                        if date_match:
                            issued_date = parse_issued_date(date_match.group(1))

                    if not issued_date:
                        # Reject alert without verifiable date per plan Section 5.2
                        report.rejected += 1
                        continue

                    # Batch numbers: must look like a batch code (contains a digit, length 4-20)
                    batch_numbers: str | None = None
                    batch_m = BATCH_REGEX.search(body_text)
                    if batch_m:
                        candidate_b = batch_m.group(1).strip()
                        if 4 <= len(candidate_b) <= 20 and any(c.isdigit() for c in candidate_b):
                            batch_numbers = candidate_b

                    # Check for matched product (exact registration match only per Section 1.3)
                    matched_reg = find_matched_reg_num(body_text, conn)

                    # Clean title, summary, product_name
                    cleaned_title = clean_alert_text(title)[:500]
                    product_mention = extract_product_name(title)
                    summary = extract_clean_summary(body_text, title)

                    alert_data = {
                        "alert_reference_no": ref_no,
                        "nafdac_reg_num": matched_reg,
                        "title": cleaned_title,
                        "product_name": (product_mention or cleaned_title)[:255],
                        "batch_numbers": batch_numbers[:255] if batch_numbers else None,
                        "summary": summary,
                        "official_source_url": url,
                        "issued_date": issued_date,
                        "is_active": True,
                    }

                    is_ins = upsert_safety_alert(alert_data, conn)
                    if is_ins:
                        report.inserted += 1
                    else:
                        report.updated += 1
                    report.parsed += 1

                except Exception as inner_e:
                    report.errors.append(f"{url}: {inner_e}")

    except Exception as e:
        report.errors.append(f"{type(e).__name__}: {str(e)}")
    finally:
        await http.close()
        report.complete()

    return report
