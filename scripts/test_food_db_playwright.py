import asyncio
from playwright.async_api import async_playwright

async def test_food_db_playwright():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent="CheckAmETL/0.1 (+mailto:dev@checkam.ng)"
        )
        print("Navigating to Food Products Database...")
        await page.goto("https://nafdac.gov.ng/food-products-database/", wait_until="networkidle", timeout=60000)
        
        # Check title
        title = await page.title()
        print("Page title:", title)
        
        # Wait for table rows to appear
        print("Waiting for table rows...")
        try:
            await page.wait_for_selector("table.ninja_footable tbody tr", timeout=30000)
            rows = await page.locator("table.ninja_footable tbody tr").all()
            print(f"Rendered rows on page: {len(rows)}")
            if rows:
                first_row_text = await rows[0].inner_text()
                print("First row text:", first_row_text)
                
            # Check pagination / next button
            pagination = await page.locator(".footable-paging, .ninja_table_paging").all()
            print(f"Pagination elements found: {len(pagination)}")
            if pagination:
                print("Pagination text:", await pagination[0].inner_text())
                
        except Exception as e:
            print("Error waiting for rows:", e)
            content = await page.content()
            print("Page content length:", len(content))
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_food_db_playwright())
