import asyncio
from playwright.async_api import async_playwright

async def log_requests():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent="CheckAmETL/0.1 (+mailto:dev@checkam.ng)"
        )
        
        requests = []
        page.on("request", lambda req: requests.append((req.method, req.url, req.resource_type)))
        
        await page.goto("https://nafdac.gov.ng/food-products-database/", wait_until="networkidle", timeout=60000)
        await page.wait_for_selector("table.ninja_footable tbody tr", timeout=30000)
        
        print(f"Total requests: {len(requests)}")
        for method, url, rtype in requests:
            if "ninja" in url.lower() or "table" in url.lower() or "admin-ajax" in url.lower() or "json" in url.lower():
                print(f"  {method} {rtype}: {url}")
                
        await browser.close()

if __name__ == "__main__":
    asyncio.run(log_requests())
