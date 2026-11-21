from checkam_etl.sources.greenbook import _determine_status

MOCK_GB_ROWS = [
    {
        "product_name": "Paracetamol Tablets BP 500mg##",
        "NAFDAC": "04-1234",
        "status": "Active",
        "expiry_date": "2027-12-31",
        "ingredient": {"ingredient_name": "Paracetamol"},
        "applicant": {"name": "Emzor Pharmaceuticals"},
    },
    {
        "product_name": "Old Inactive Pill",
        "NAFDAC": "04-9999",
        "status": "Inactive",
        "expiry_date": "2020-01-01",
        "ingredient": {"ingredient_name": "Some chemical"},
        "applicant": {"name": "Old Maker"},
    },
]


def test_greenbook_status_determination() -> None:
    assert _determine_status("Active", "2030-01-01") == "Active"
    assert _determine_status("Inactive", "2030-01-01") == "Expired"
    assert _determine_status("Active", "2020-01-01") == "Expired"
    assert _determine_status(None, None) == "Active"


CFG = {
    "otc_marketing_category_ids": [2],
    "otc_category_names": ["Drugs", "Herbals and Nutraceuticals"],
    "excluded_routes": ["intravenous", "intramuscular"],
}


def _row(**kw: object) -> dict[str, object]:
    base: dict[str, object] = {
        "marketing_category_id": 2,
        "category_name": "Drugs",
        "route_name": "Oral",
    }
    base.update(kw)
    return base


def test_otc_uses_portal_marketing_category() -> None:
    from checkam_etl.sources.greenbook import is_otc_row

    assert is_otc_row(_row(), CFG)
    assert is_otc_row(_row(category_name="Herbals and Nutraceuticals"), CFG)
    # prescription-only class (e.g. amoxicillin, tramadol) is excluded even if the name matches
    assert not is_otc_row(_row(marketing_category_id=1, product_name="Paracetamol"), CFG)
    assert not is_otc_row(_row(marketing_category_id=5), CFG)  # devices
    assert not is_otc_row(_row(category_name="Medical devices"), CFG)
    assert not is_otc_row(_row(route_name="Intramuscular"), CFG)  # injectables never OTC


def test_clean_product_name() -> None:
    from checkam_etl.sources.greenbook import clean_product_name

    assert clean_product_name("Anuheal Cream_") == "Anuheal Cream"
    assert clean_product_name("Uptamin Syrup## (check strength and composition)") == "Uptamin Syrup"
    assert clean_product_name("*Well Life Blood Bag") == "Well Life Blood Bag"
    assert clean_product_name("Balmal 80/480 Tablets**") == "Balmal 80/480 Tablets"
