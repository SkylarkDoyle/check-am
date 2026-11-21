from checkam_etl.normalize import (
    clean_reg_display,
    map_category,
    normalize_reg,
    validate_reg_num,
)


def test_normalize_reg() -> None:
    assert normalize_reg("01-4582") == "014582"
    assert normalize_reg(" 01 4582 ") == "014582"
    assert normalize_reg("A4–5678") == "A45678"  # en dash
    assert normalize_reg("a4-1234") == "A41234"  # lowercase
    assert normalize_reg("") == ""


def test_clean_reg_display() -> None:
    assert clean_reg_display("01 - 4582") == "01-4582"
    assert clean_reg_display(" 01-4582 ") == "01-4582"
    assert clean_reg_display("A4–5678") == "A4-5678"
    assert clean_reg_display("01 4582") == "01-4582"


def test_validate_reg_num() -> None:
    assert validate_reg_num("01-4582") == "01-4582"
    assert validate_reg_num("") is None
    assert validate_reg_num("   ") is None
    assert validate_reg_num("X" * 51) is None
    assert validate_reg_num("---") is None


def test_map_category() -> None:
    mapping = {
        "Food": "Food",
        "Beverages": "Beverage",
        "Farm Produce": "Food",
        "Toothpaste": "Toothpaste",
    }
    assert map_category("Beverages", mapping) == "Beverage"
    assert map_category("Farm Produce", mapping) == "Food"
    assert map_category("Unknown Widget", mapping) is None


def test_date_mangled_regs_are_rejected() -> None:
    from checkam_etl.normalize import is_date_mangled_reg

    for bad in ("Aug-67", "AUG-09", "jan-19", "Sep 12", "Dec-1"):
        assert is_date_mangled_reg(bad)
        assert validate_reg_num(bad) is None
    for good in ("A8-100791", "04-4753", "A4-6099", "B1-2971", "01-4582"):
        assert not is_date_mangled_reg(good)
        assert validate_reg_num(good) == good
