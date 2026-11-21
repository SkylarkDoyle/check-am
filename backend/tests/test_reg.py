import pytest
from httpx import AsyncClient
from psycopg import sql

from app.db import get_db_connection
from app.reg import clean_reg_display, looks_like_reg, normalize_reg


def test_normalize_reg() -> None:
    assert normalize_reg("01-4721") == "014721"
    assert normalize_reg(" 01 - 4721 ") == "014721"
    assert normalize_reg("a4-2260") == "A42260"
    assert normalize_reg("B2/1234") == "B21234"
    assert normalize_reg("04-1234") == "041234"


def test_clean_reg_display() -> None:
    assert clean_reg_display("01 - 4721") == "01-4721"
    assert clean_reg_display("01–4721") == "01-4721"  # en-dash
    assert clean_reg_display("A4 2260") == "A4-2260"
    assert clean_reg_display("A4-2260") == "A4-2260"
    assert clean_reg_display("B2-1234") == "B2-1234"


def test_looks_like_reg() -> None:
    assert looks_like_reg("01-4721") is True
    assert looks_like_reg("014721") is True
    assert looks_like_reg("A4-2260") is True
    assert looks_like_reg("A42260") is True
    assert looks_like_reg("B2-9999") is True
    assert looks_like_reg("paracetamol") is False
    assert looks_like_reg("Nestle") is False
    assert looks_like_reg("AB") is False  # too short


@pytest.mark.asyncio
async def test_reg_normalized_db_parity(client: AsyncClient) -> None:
    # Query sample products from the database and verify python normalize_reg matches Postgres
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                sql.SQL("SELECT nafdac_reg_num, normalized_reg_num FROM products LIMIT 100;")
            )
            rows = await cur.fetchall()
            assert len(rows) > 0
            for row in rows:
                expected = row["normalized_reg_num"]
                actual = normalize_reg(row["nafdac_reg_num"])
                reg_num = row["nafdac_reg_num"]
                msg = f"Mismatch for {reg_num}: expected {expected}, got {actual}"
                assert actual == expected, msg
