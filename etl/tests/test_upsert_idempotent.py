from checkam_etl.db import ProductRow, get_db_connection, upsert_products_batch


def test_upsert_products_idempotent() -> None:
    test_products = [
        ProductRow(
            nafdac_reg_num="TEST-0001",
            product_name="Test Product One",
            brand_name="Test Brand",
            category="Food",
            manufacturer="Test Maker",
            status="Active",
            external_image_url="https://example.com/test.jpg",
            source_portal="FoodDB",
        ),
        ProductRow(
            nafdac_reg_num="TEST-0002",
            product_name="Test Product Two",
            brand_name="Test Brand Two",
            category="Beverage",
            manufacturer="Test Maker",
            status="Active",
            external_image_url=None,
            source_portal="FoodDB",
        ),
    ]

    with get_db_connection() as conn:
        # First run: inserts
        ins, upd = upsert_products_batch(test_products, conn)
        assert ins == 2
        assert upd == 0

        # Second run with same data: updates, 0 inserts
        ins2, upd2 = upsert_products_batch(test_products, conn)
        assert ins2 == 0
        assert upd2 == 2

        # Verify image URL was preserved when incoming has None
        test_products_none_img = [
            ProductRow(
                nafdac_reg_num="TEST-0001",
                product_name="Test Product One",
                brand_name="Test Brand",
                category="Food",
                manufacturer="Renamed Maker",
                status="Active",
                external_image_url=None,  # Incoming is None
                source_portal="FoodDB",
            )
        ]
        upsert_products_batch(test_products_none_img, conn)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT external_image_url, product_name FROM products "
                "WHERE nafdac_reg_num = 'TEST-0001'"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "https://example.com/test.jpg"  # Not wiped!
            assert row[1] == "Test Product One"

        # Verify Alert_Flagged is not wiped by Active update
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE products SET status = 'Alert_Flagged' WHERE nafdac_reg_num = 'TEST-0001'"
            )
            conn.commit()

        upsert_products_batch(test_products, conn)
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM products WHERE nafdac_reg_num = 'TEST-0001'")
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "Alert_Flagged"  # Preserved!

        # Cleanup test rows
        with conn.cursor() as cur:
            cur.execute("DELETE FROM products WHERE nafdac_reg_num IN ('TEST-0001', 'TEST-0002')")
            conn.commit()


def test_two_products_can_share_a_registration_number() -> None:
    def prod(name: str) -> ProductRow:
        return ProductRow(
            nafdac_reg_num="TEST-SHARED",
            product_name=name,
            category="Food",
            manufacturer="Maker",
            source_portal="FoodDB",
        )

    with get_db_connection() as conn:
        ins, _ = upsert_products_batch([prod("Yoghurt Strawberry"), prod("Yoghurt Mango")], conn)
        assert ins == 2
        ins2, upd2 = upsert_products_batch([prod("yoghurt strawberry ")], conn)  # same identity
        assert (ins2, upd2) == (0, 1)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM products WHERE nafdac_reg_num = 'TEST-SHARED'")
            row = cur.fetchone()
            assert row is not None
            assert row[0] == 2
            cur.execute("DELETE FROM products WHERE nafdac_reg_num = 'TEST-SHARED'")
            conn.commit()
