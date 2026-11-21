"""seed packaging checklists"""
import json
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

COMMON_POINTS = [
    {
        "label": "NAFDAC number on the pack",
        "detail": "Printed clearly, matches the registry record."
    },
    {
        "label": "Seal intact",
        "detail": "No gaps, glue marks or re-taping."
    },
    {
        "label": "Spelling and print quality",
        "detail": "Brand and maker names read correctly, no smudging."
    },
    {
        "label": "Expiry date format",
        "detail": "One consistent style, for example 06/2027."
    },
    {
        "label": "Batch and manufacture date",
        "detail": "Present, printed the same way as the expiry date."
    }
]

SEEDS = [
    {
        "category": "Food",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {"label": "Net weight and ingredient list", "detail": "Metric units (g/kg), clear listing with allergen declarations."}
        ]
    },
    {
        "category": "Beverage",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {"label": "Cap security ring", "detail": "Tamper-evident ring unbroken, no leakage around neck or crimp."}
        ]
    },
    {
        "category": "Toothpaste",
        "prefix": "02-",
        "points": COMMON_POINTS + [
            {"label": "Foil seal on nozzle", "detail": "Original protective foil seal intact before first use."}
        ]
    },
    {
        "category": "Cosmetic",
        "prefix": "02-",
        "points": COMMON_POINTS + [
            {"label": "Full ingredient nomenclature", "detail": "INCI nomenclature listed, manufacturer address in full."}
        ]
    },
    {
        "category": "OTC",
        "prefix": "A4-",
        "points": COMMON_POINTS + [
            {"label": "Dosage and active ingredients", "detail": "Clear strength (e.g. 500mg), blister pack intact with no air pockets."}
        ]
    }
]


def upgrade() -> None:
    conn = op.get_bind()
    insert_sql = sa.text("""
        INSERT INTO packaging_checklists (category, inspection_points, expected_reg_prefix, updated_at)
        VALUES (:category, CAST(:points AS jsonb), :prefix, now())
        ON CONFLICT (category) DO UPDATE
        SET inspection_points = EXCLUDED.inspection_points,
            expected_reg_prefix = EXCLUDED.expected_reg_prefix,
            updated_at = now()
    """)
    for seed in SEEDS:
        conn.execute(
            insert_sql,
            {
                "category": seed["category"],
                "points": json.dumps(seed["points"]),
                "prefix": seed["prefix"]
            }
        )


def downgrade() -> None:
    op.execute("DELETE FROM packaging_checklists WHERE category IN ('Food', 'Beverage', 'Toothpaste', 'Cosmetic', 'OTC')")
