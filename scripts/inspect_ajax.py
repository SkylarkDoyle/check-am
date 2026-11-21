import asyncio
import json
import re
import httpx
from bs4 import BeautifulSoup

async def inspect_ajax():
    client = httpx.AsyncClient(
        headers={"User-Agent": "CheckAmETL/0.1 (+mailto:dev@checkam.ng)"},
        timeout=25.0,
        follow_redirects=True
    )
    
    # 1. Inspect Food DB Ninja Table Ajax config in page source
    print("\n=== Inspecting Food DB Ninja Tables Config ===")
    resp = await client.get("https://nafdac.gov.ng/food-products-database/")
    # Find ninja_table_configuration or ninja_table_ajax
    matches = re.findall(r'ninja_table_instance_\d+\s*=\s*(\{.*?\});', resp.text, re.DOTALL)
    if matches:
        print(f"Found {len(matches)} ninja table instances")
        print("Instance 0 preview:", matches[0][:400])
    else:
        # Search for any json object containing ajax or table_id
        for script in re.findall(r'<script[^>]*>(.*?)</script>', resp.text, re.DOTALL):
            if "ninja" in script.lower() and "ajax" in script.lower():
                print("Found ninja script snippet:", script[:500])
                break

    # Also check admin-ajax.php or rest-api endpoint for ninja tables
    # Typical Ninja Tables ajax: /wp-admin/admin-ajax.php?action=ninja_tables_get_table_data&table_id=19494
    print("\nTesting Ninja Tables Ajax endpoint:")
    test_ajax_url = "https://nafdac.gov.ng/wp-admin/admin-ajax.php"
    # Ninja tables usually takes action=ninja_tables_get_public_data or ninja_tables_get_table_data
    for action in ["ninja_tables_get_public_data", "ninja_tables_get_table_data"]:
        r = await client.get(test_ajax_url, params={"action": action, "table_id": "19494"})
        print(f"Action {action} -> Status: {r.status_code}, Length: {len(r.content)}")
        if r.status_code == 200:
            print("Content preview:", r.text[:300])

    # 2. Inspect Greenbook DataTables Ajax
    print("\n=== Inspecting Greenbook DataTables ===")
    gb_resp = await client.get("https://greenbook.nafdac.gov.ng/")
    soup = BeautifulSoup(gb_resp.text, "html.parser")
    for script in soup.find_all("script"):
        text = script.get_text()
        if "DataTable" in text and "ajax" in text:
            print("Full Greenbook DataTable script:")
            print(text)

    await client.aclose()

if __name__ == "__main__":
    asyncio.run(inspect_ajax())
