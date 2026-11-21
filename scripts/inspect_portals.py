import asyncio
import httpx

async def inspect_portals():
    client = httpx.AsyncClient(
        headers={"User-Agent": "CheckAmETL/0.1 (+mailto:dev@checkam.ng)"},
        timeout=20.0,
        follow_redirects=True
    )
    
    urls = [
        "https://www.nafdac.gov.ng/robots.txt",
        "https://www.nafdac.gov.ng/food-products-database/",
        "https://registration.nafdac.gov.ng/robots.txt",
        "https://registration.nafdac.gov.ng/",
        "https://greenbook.nafdac.gov.ng/",
        "https://www.nafdac.gov.ng/category/public-alerts/"
    ]
    
    for url in urls:
        print(f"\n--- Checking: {url} ---")
        try:
            resp = await client.get(url)
            print(f"Status: {resp.status_code}")
            print(f"Final URL: {resp.url}")
            print(f"Content-Type: {resp.headers.get('Content-Type')}")
            print(f"Snippet (first 300 chars):\n{resp.text[:300]}")
        except Exception as e:
            print(f"Error checking {url}: {e}")
            
    await client.aclose()

if __name__ == "__main__":
    asyncio.run(inspect_portals())
