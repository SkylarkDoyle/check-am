from checkam_etl.normalize import map_category, validate_reg_num
from checkam_etl.sources.food_db import _determine_status

MOCK_FOOD_DB_ROWS = [
    {
        "value": {
            "productname": "Test Soy Milk Powder",
            "nafdacnumber": "TEST-0101",
            "category": "Food",
            "subcategory": "Cereals and Cereal Products",
            "manufacturer": "Test Agro Ltd",
            "expirydate": "19/12/2020",  # Expired
        }
    },
    {
        "value": {
            "productname": "Test Malt Drink",
            "nafdacnumber": "TEST-0102",
            "category": "Food",
            "subcategory": "Beverages",
            "manufacturer": "Test Brewery Ltd",
            "expirydate": "14/12/2030",  # Active
        }
    },
]

CATEGORY_MAP = {
    "Beverages": "Beverage",
    "Cereals and Cereal Products": "Food",
}


def test_food_db_parse_mock() -> None:
    row1 = MOCK_FOOD_DB_ROWS[0]["value"]
    reg1 = validate_reg_num(row1["nafdacnumber"])
    assert reg1 == "TEST-0101"
    cat1 = map_category(row1["subcategory"], CATEGORY_MAP)
    assert cat1 == "Food"
    status1 = _determine_status(row1["expirydate"])
    assert status1 == "Expired"

    row2 = MOCK_FOOD_DB_ROWS[1]["value"]
    reg2 = validate_reg_num(row2["nafdacnumber"])
    assert reg2 == "TEST-0102"
    cat2 = map_category(row2["subcategory"], CATEGORY_MAP)
    assert cat2 == "Beverage"
    status2 = _determine_status(row2["expirydate"])
    assert status2 == "Active"


def test_dedupe_keeps_distinct_products_sharing_a_reg_number() -> None:
    from checkam_etl.db import ProductRow, dedupe_products

    def row(reg: str, name: str) -> ProductRow:
        return ProductRow(
            nafdac_reg_num=reg,
            product_name=name,
            category="Food",
            manufacturer="M",
            source_portal="FoodDB",
        )

    rows = [row("A8-1", "Jam"), row("A8-1", "JAM "), row("A8-2", "Tea"), row("A8-2", "Coffee")]
    uniq, collapsed, shared = dedupe_products(rows)
    assert len(uniq) == 3  # A8-1 Jam, A8-2 Tea, A8-2 Coffee: nothing real is lost
    assert collapsed == 1  # only the true duplicate
    assert shared == 1  # A8-2 carries two products
