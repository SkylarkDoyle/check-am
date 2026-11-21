import asyncio
import json
import httpx

async def test_greenbook_ajax():
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
        "length": 10,
        "search[value]": "",
        "search[regex]": "false"
    }
    
    url = "https://greenbook.nafdac.gov.ng"
    print(f"Requesting {url} with {params}...")
    try:
        resp = await client.get(url, params=params)
        print("Status:", resp.status_code)
        print("Content-Type:", resp.headers.get("Content-Type"))
        data = resp.json()
        print("Keys:", list(data.keys()))
        print("recordsTotal:", data.get("recordsTotal"))
        print("recordsFiltered:", data.get("recordsFiltered"))
        print("data count:", len(data.get("data", [])))
        if data.get("data"):
            print("Sample record 0:", json.dumps(data["data"][0], indent=2))
    except Exception as e:
        print("Error:", e)
    finally:
        await client.aclose()

if __name__ == "__main__":
    asyncio.run(test_greenbook_ajax())
