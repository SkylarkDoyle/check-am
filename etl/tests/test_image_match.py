from checkam_etl.image_match import (
    build_queries,
    clean_name,
    distinctive_tokens,
    load_match_config,
    maker_tokens,
    rank_candidates,
    score_candidate,
)
from checkam_etl.imagesearch.base import Candidate

CFG = load_match_config()


def cand(
    title: str,
    image: str = "https://shop.example.ng/cdn/shop/files/x.jpg",
    page: str = "https://shop.example.ng/products/x",
    w: int | None = 800,
    h: int | None = 800,
) -> Candidate:
    return Candidate(image_url=image, page_url=page, title=title, width=w, height=h)


def test_clean_name_strips_notes_and_symbols() -> None:
    assert clean_name("Ibucap Capsules $") == "Ibucap Capsules"
    assert clean_name("Milo 3 in 1 (Milk; Malt & Cocoa) Energy Drink") == "Milo 3 in 1 Energy Drink"


def test_tokens_drop_generic_and_pack_words() -> None:
    assert distinctive_tokens("Strepsil Intensive Lozenges 16s", CFG) == ["strepsil", "intensive"]
    assert maker_tokens("Reckitt Benckiser Nigeria Limited", CFG) == ["reckitt", "benckiser"]


def test_build_queries_at_most_two() -> None:
    qs = build_queries("BIGI Grape Pineapple Soft Drink", "Rite Foods Limited", CFG)
    assert qs == ["BIGI Grape Pineapple Soft Drink rite", "BIGI Grape Pineapple Soft Drink Nigeria"]


def test_good_match_accepted() -> None:
    c = cand("Simsek Choco Bien Milk Chocolate Wafer 32g in Nigeria - Supermart")
    res = score_candidate(c, "SIMSEK CHOCO BIEN", "SIMSEK BISCUITS AND FOOD INC", "Food", CFG)
    assert res.usable
    assert res.score >= CFG.threshold
    assert rank_candidates([c], "SIMSEK CHOCO BIEN", "SIMSEK BISCUITS AND FOOD INC", "Food", CFG)


def test_wrong_product_rejected() -> None:
    c = cand("Greek Extra Virgin Olive Oils, high polyphenolic, low acidity")
    name = "ORIBU LIQUID GOLD EXTRA VIRGIN OLIVE OIL"
    res = score_candidate(c, name, "Nikolopoulos", "Food", CFG)
    assert res.reject_reason == "brand_missing"


def test_blocked_domain_and_http_rejected() -> None:
    stock = cand("Blackcurrant Ice Lolly", image="https://c8.alamy.com/x.jpg",
                 page="https://www.alamy.com/p")
    assert score_candidate(stock, "Supreme Ice Lolly", "UAC Foods", "Food", CFG).reject_reason \
        == "blocked_domain"
    plain = cand("Supreme Ice Lolly", image="http://shop.example.ng/x.jpg")
    assert score_candidate(plain, "Supreme Ice Lolly", "UAC Foods", "Food", CFG).reject_reason \
        == "not_https"


def test_too_small_rejected() -> None:
    c = cand("Supreme Ice Lolly UAC", w=120, h=120)
    assert score_candidate(c, "Supreme Ice Lolly", "UAC Foods", "Food", CFG).reject_reason \
        == "too_small"


def test_otc_requires_maker() -> None:
    c = cand("Artemether 80 mg and Lumefantrine 480 mg Tablets")
    res = score_candidate(
        c, "Artemether 80 mg & Lumefantrine 480 mg Tablets", "Krismediks Nigeria Limited",
        "OTC", CFG,
    )
    assert res.reject_reason == "otc_needs_maker"
    ok = cand("Krismediks Artemether Lumefantrine 80/480 Tablets")
    assert score_candidate(
        ok, "Artemether 80 mg & Lumefantrine 480 mg Tablets", "Krismediks Nigeria Limited",
        "OTC", CFG,
    ).usable


def test_negative_word_and_banner_penalised() -> None:
    clean = cand("Zaika Marinade Mix Zaika Foods", w=800, h=800)
    junk = cand("Zaika Marinade Mix Zaika Foods logo", w=1600, h=400)
    a = score_candidate(clean, "Zaika Marinade mix", "Zaika Foods Limited", "Food", CFG)
    b = score_candidate(junk, "Zaika Marinade mix", "Zaika Foods Limited", "Food", CFG)
    assert a.score > b.score
    assert not rank_candidates([junk], "Zaika Marinade mix", "Zaika Foods Limited", "Food", CFG)


def test_ranking_orders_best_first() -> None:
    weak = cand("Strepsils Lozenges", w=250, h=250)
    strong = cand("Strepsils Intensive Lozenges X16 Reckitt Benckiser - Pharmacy", w=1200, h=1200)
    ranked = rank_candidates(
        [weak, strong], "Strepsil Intensive Lozenges", "Reckitt Benckiser Nigeria Limited",
        "OTC", CFG,
    )
    assert ranked
    assert ranked[0][1] is strong


def test_variant_and_lookalike_products_rejected() -> None:
    # Every distinctive word must appear: "Avro Apetit" is not "Avro Eye Drop".
    eye = cand("Avro Eye Drop 0.004", page="https://www.arogga.com/product/1940/avro-eye-drop")
    res_eye = score_candidate(eye, "Avro Apetit Syrup", "Avro Pharma Limited", "OTC", CFG)
    assert res_eye.reject_reason == "name_mismatch"
    # A different variant ("plain" vs "sweetened") is a different product.
    plain = cand("Bugo Plain Drinking Yogurt Kezia Foods")
    res = score_candidate(plain, "BUGO SWEETENED DRINKING YOGHURT", "KEZIA FOODS LTD", "Food", CFG)
    assert res.reject_reason == "name_mismatch"


def test_single_letter_variant_is_kept() -> None:
    # "Cet-Z" must not match "CET-HL Cold".
    other = cand("CET HL COLD TAB", image="https://www.hl.example.in/wp-content/CET-HL-COLD-TAB.jpeg",
                 page="https://www.hl.example.in/tab-cethl-cold/")
    res = score_candidate(other, "Cet-Z Tablets", "Generics and Specialities", "OTC", CFG)
    assert not res.usable


def test_marketplace_listing_blocked() -> None:
    etsy = cand("Nescafe Original 3 in 1", image="https://i.etsystatic.com/x.jpg",
                page="https://www.etsy.com/listing/1/nescafe-original-3-in-1")
    res = score_candidate(etsy, "Nescafe Original 3 in 1", "Nestle", "Beverage", CFG)
    assert res.reject_reason == "blocked_domain"
