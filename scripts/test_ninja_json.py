import asyncio
import json
import re
import httpx

async def test_ninja_json():
    client = httpx.AsyncClient(
        headers={
            "User-Agent": "CheckAmETL/0.1 (+mailto:dev@checkam.ng)",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://nafdac.gov.ng/food-products-database/"
        },
        timeout=30.0
    )
    
    # 1. Fetch page to extract nonce
    resp = await client.get("https://nafdac.gov.ng/food-products-database/")
    nonce_match = re.search(r'ninja_table_public_nonce["\']\s*:\s*["\']([a-f0-9]+)["\']', resp.text)
    if not nonce_match:
        nonce_match = re.search(r'ninja_table_public_nonce=([a-f0-9]+)', resp.text)
    nonce = nonce_match.group(1) if nonce_match else "d48c5c6f87"
    print("Found nonce:", nonce)
    
    # 2. Fetch chunk 0
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
    print("Chunk 0 status:", r.status_code)
    try:
        data = r.json()
        print("Type of data:", type(data))
        if isinstance(data, list):
            print(f"Total items in chunk 0: {len(data)}")
            print("Item 0:", json.dumps(data[0], indent=2))
        elif isinstance(data, dict):
            print("Keys:", list(data.keys()))
    except Exception as e:
        print("Error parsing json:", e, r.text[:200])
        
    await client.aclose()

if __name__ == "__main__":
    asyncio.run(test_ninja_json())
