import asyncio
import re
import httpx
from bs4 import BeautifulSoup

async def inspect_alerts():
    client = httpx.AsyncClient(headers={"User-Agent": "CheckAmETL/0.1 (+mailto:dev@checkam.ng)"}, timeout=30.0)
    
    url = "https://nafdac.gov.ng/category/recalls-and-alerts/"
    print(f"Fetching {url}...")
    resp = await client.get(url)
    soup = BeautifulSoup(resp.text, "html.parser")
    
    articles = soup.find_all("article")
    print(f"Found {len(articles)} articles on page 1")
    
    alert_posts = []
    for art in articles:
        h2 = art.find(["h2", "h3"])
        link = art.find("a")
        date_el = art.find("time") or art.find(class_=re.compile(r"date|time|meta"))
        title = h2.get_text(strip=True) if h2 else ""
        href = link.get("href") if link else ""
        date_text = date_el.get_text(strip=True) if date_el else ""
        alert_posts.append((title, href, date_text))
        
    for t, h, d in alert_posts[:5]:
        print(f"\nTitle: {t}\nDate: {d}\nURL: {h}")
        # Fetch individual alert post to see if there is PDF or text content
        post_resp = await client.get(h)
        post_soup = BeautifulSoup(post_resp.text, "html.parser")
        pdf_links = [a["href"] for a in post_soup.find_all("a", href=True) if a["href"].endswith(".pdf")]
        print("  PDF links found:", pdf_links)
        # Check text body snippet
        content_div = post_soup.find("div", class_=re.compile(r"content|entry|post"))
        if content_div:
            text_lines = [line.strip() for line in content_div.get_text().split("\n") if line.strip()]
            print("  Body sample:", " | ".join(text_lines[:4]))
            
    await client.aclose()

if __name__ == "__main__":
    asyncio.run(inspect_alerts())
