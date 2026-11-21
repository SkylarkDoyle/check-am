import asyncio
import re
from collections import Counter
import httpx

async def check_categories():
    client = httpx.AsyncClient(headers={"User-Agent": "CheckAmETL/0.1 (+mailto:dev@checkam.ng)"}, timeout=30.0)
    resp = await client.get("https://nafdac.gov.ng/food-products-database/")
    nonce_match = re.search(r'ninja_table_public_nonce["\']\s*:\s*["\']([a-f0-9]+)["\']', resp.text)
    nonce = nonce_match.group(1) if nonce_match else "d48c5c6f87"
    
    ajax_url = "https://nafdac.gov.ng/wp-admin/admin-ajax.php"
    params = {
        "action": "wp_ajax_ninja_tables_public_action",
        "table_id": "19494",
        "target_action": "get-all-data",
        "default_sorting": "old_first",
        "skip_rows": "0",
        "limit_rows": "0",
        "ninja_table_public_nonce": nonce,
        "chunk_number": "0"
    }
    r = await client.get(ajax_url, params=params)
    data = r.json()
    cats = Counter()
    subcats = Counter()
    for item in data:
        val = item.get("value", {})
        cats[val.get("category")] += 1
        subcats[val.get("subcategory")] += 1
        
    print("Categories:", cats)
    print("Subcategories (top 15):", subcats.most_common(15))
    await client.aclose()

if __name__ == "__main__":
    asyncio.run(check_categories())
