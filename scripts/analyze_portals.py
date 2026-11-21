import asyncio
import re
import httpx
from bs4 import BeautifulSoup

async def analyze_pages():
    client = httpx.AsyncClient(
        headers={"User-Agent": "CheckAmETL/0.1 (+mailto:dev@checkam.ng)"},
        timeout=25.0,
        follow_redirects=True
    )

    # 1. Inspect Food DB
    print("\n=== 1. Food Products Database ===")
    try:
        resp = await client.get("https://nafdac.gov.ng/food-products-database/")
        soup = BeautifulSoup(resp.text, "html.parser")
        tables = soup.find_all("table")
        print(f"Found {len(tables)} tables")
        for i, t in enumerate(tables):
            print(f"Table {i}: id={t.get('id')} class={t.get('class')}")
            headers = [th.get_text(strip=True) for th in t.find_all("th")]
            print(f"  Headers: {headers}")
            rows = t.find_all("tr")
            print(f"  Row count on page: {len(rows)}")
            if len(rows) > 1:
                sample_cells = [td.get_text(strip=True) for td in rows[1].find_all("td")]
                print(f"  Sample row 1: {sample_cells}")
        
        # Check for iframes or DataTables scripts
        iframes = soup.find_all("iframe")
        print(f"Found {len(iframes)} iframes: {[f.get('src') for f in iframes]}")
        scripts = [s.get("src") for s in soup.find_all("script") if s.get("src")]
        dt_scripts = [s for s in scripts if "dataTables" in s.lower() or "table" in s.lower()]
        print(f"Table-related scripts: {dt_scripts}")
    except Exception as e:
        print(f"Error inspecting Food DB: {e}")

    # 2. Inspect Greenbook
    print("\n=== 2. Greenbook ===")
    try:
        resp = await client.get("https://greenbook.nafdac.gov.ng/")
        soup = BeautifulSoup(resp.text, "html.parser")
        tables = soup.find_all("table")
        print(f"Found {len(tables)} tables in Greenbook")
        for i, t in enumerate(tables):
            print(f"Table {i}: id={t.get('id')} class={t.get('class')}")
            headers = [th.get_text(strip=True) for th in t.find_all("th")]
            print(f"  Headers: {headers}")
        
        # Look for inline scripts mentioning ajax or datatable
        inline_scripts = [s.get_text() for s in soup.find_all("script") if not s.get("src")]
        for sc in inline_scripts:
            if "ajax" in sc.lower() or "datatable" in sc.lower():
                print("Found DataTables/ajax script snippet in Greenbook:")
                lines = [l.strip() for l in sc.split("\n") if any(k in l.lower() for k in ["ajax", "url", "columns", "datatable"])]
                print("\n".join(lines[:20]))
    except Exception as e:
        print(f"Error inspecting Greenbook: {e}")

    # 3. Search for Public Alerts URL
    print("\n=== 3. Public Alerts Search ===")
    try:
        # Search NAFDAC search or sitemap for public-alerts
        sitemap_resp = await client.get("https://nafdac.gov.ng/wp-sitemap.xml")
        print("Sitemap status:", sitemap_resp.status_code)
        
        # Try search endpoint
        search_resp = await client.get("https://nafdac.gov.ng/?s=public+alert")
        soup = BeautifulSoup(search_resp.text, "html.parser")
        alert_links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "alert" in href.lower() or "public-alert" in href.lower() or "recall" in href.lower():
                text = a.get_text(strip=True)
                if text and len(text) > 5 and href not in [x[0] for x in alert_links]:
                    alert_links.append((href, text))
        print(f"Found {len(alert_links)} alert links from search:")
        for h, t in alert_links[:10]:
            print(f"  {h} -> {t}")
    except Exception as e:
        print(f"Error searching Public Alerts: {e}")

    # 4. Check NAPAMS
    print("\n=== 4. NAPAMS ===")
    try:
        resp = await client.get("https://registration.nafdac.gov.ng/")
        soup = BeautifulSoup(resp.text, "html.parser")
        has_login = "login" in resp.text.lower() or "sign in" in resp.text.lower()
        inputs = [inp.get("name") for inp in soup.find_all("input")]
        print(f"NAPAMS title: {soup.title.string if soup.title else None}")
        print(f"Has login keywords: {has_login}, Form inputs: {inputs}")
    except Exception as e:
        print(f"Error checking NAPAMS: {e}")

    await client.aclose()

if __name__ == "__main__":
    asyncio.run(analyze_pages())
