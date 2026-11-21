import asyncio
from collections import Counter
import httpx

async def check_greenbook_categories():
    client = httpx.AsyncClient(
        headers={
            "User-Agent": "CheckAmETL/0.1 (+mailto:dev@checkam.ng)",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        },
        timeout=30.0
    )
    
    params = {
        "draw": 1,
        "start": 0,
        "length": 200,
        "search[value]": "",
        "search[regex]": "false"
    }
    
    resp = await client.get("https://greenbook.nafdac.gov.ng", params=params)
    data = resp.json()
    cats = Counter()
    for row in data.get("data", []):
        cat = row.get("product_category", {})
        cname = cat.get("name") if isinstance(cat, dict) else str(cat)
        cats[cname] += 1
    print("Greenbook product categories in 200 sample:", cats)
    await client.aclose()

if __name__ == "__main__":
    asyncio.run(check_greenbook_categories())
