"""support category-driven checklist variants and structured points

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-21
"""

import json
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

COMMON_POINTS = [
    {
        "key": "reg_number",
        "label": "NAFDAC number on pack",
        "detail": "Printed clearly, matches {reg_number}.",
        "kind": "common",
    },
    {
        "key": "seal_intact",
        "label": "Seal intact",
        "detail": "No gaps, glue marks or re-taping.",
        "kind": "common",
    },
    {
        "key": "print_quality",
        "label": "Spelling and print quality",
        "detail": "Brand and maker names read correctly, no smudging.",
        "kind": "common",
    },
    {
        "key": "expiry_format",
        "label": "Expiry date format",
        "detail": "One consistent style, for example {expiry_example}.",
        "kind": "common",
    },
    {
        "key": "batch_mfr",
        "label": "Batch and manufacture date",
        "detail": "Present, printed in the same style as the expiry date.",
        "kind": "common",
    },
]

SEEDED_VARIANTS = [
    # Category Defaults (variant = '')
    {
        "category": "Food",
        "variant": "",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {
                "key": "net_weight",
                "label": "Net weight and ingredient list",
                "detail": "Metric units (g/kg), clear listing with allergen declarations.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "Beverage",
        "variant": "",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {
                "key": "cap_ring",
                "label": "Cap security ring",
                "detail": "Tamper-evident ring unbroken, no leakage around neck.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "Toothpaste",
        "variant": "",
        "prefix": "02-",
        "points": COMMON_POINTS + [
            {
                "key": "toothpaste_foil",
                "label": "Foil seal on nozzle",
                "detail": "Original protective foil seal intact before first use, batch embossed on crimp.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "Cosmetic",
        "variant": "",
        "prefix": "02-",
        "points": COMMON_POINTS + [
            {
                "key": "cosmetic_inci",
                "label": "INCI ingredients and PAO",
                "detail": "Full INCI nomenclature listed, Period-After-Opening symbol present.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "OTC",
        "variant": "",
        "prefix": "A4-",
        "points": COMMON_POINTS + [
            {
                "key": "otc_dosage",
                "label": "Dosage and active ingredients",
                "detail": "Clear strength (e.g. 500mg), manufacturer address stated in full.",
                "kind": "specific",
            }
        ],
    },
    # Specific Pack Variants
    {
        "category": "Food",
        "variant": "sachet",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {
                "key": "pouch_seam",
                "label": "Heat-sealed edges",
                "detail": "Clean, continuous hermetic crimp with no pinholes or powder leakage.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "Food",
        "variant": "tin",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {
                "key": "tin_integrity",
                "label": "Can seam and surface",
                "detail": "No rusting, bulging ends, dented seams, or lacquer peel.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "Beverage",
        "variant": "glass_bottle",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {
                "key": "crown_cork",
                "label": "Crown cork or pry-off cap",
                "detail": "Undented cap, no rust beneath crimp, pristine factory seal.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "Beverage",
        "variant": "pet_bottle",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {
                "key": "pet_collar",
                "label": "Plastic tamper ring",
                "detail": "Perforations unbroken, clicks on initial twist, neck bead intact.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "Beverage",
        "variant": "sachet",
        "prefix": "A8-",
        "points": COMMON_POINTS + [
            {
                "key": "sachet_weld",
                "label": "Pouch weld integrity",
                "detail": "No seam weeping, laser lot code clearly legible on pillow fold.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "OTC",
        "variant": "tablet",
        "prefix": "A4-",
        "points": COMMON_POINTS + [
            {
                "key": "blister_foil",
                "label": "Blister pack cavity & foil",
                "detail": "Foil backing unbroken, no crushed pockets, uniform tablet color.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "OTC",
        "variant": "capsule",
        "prefix": "A4-",
        "points": COMMON_POINTS + [
            {
                "key": "capsule_shell",
                "label": "Capsule shell and blister",
                "detail": "Blister seal intact, capsules uniform in banding and locking without powder leakage.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "OTC",
        "variant": "syrup",
        "prefix": "A4-",
        "points": COMMON_POINTS + [
            {
                "key": "bottle_measuring_cap",
                "label": "Measuring cup and cap seal",
                "detail": "Graduated metric dose cup included, tamper band firmly joined to closure.",
                "kind": "specific",
            }
        ],
    },
    {
        "category": "OTC",
        "variant": "cream",
        "prefix": "A4-",
        "points": COMMON_POINTS + [
            {
                "key": "tube_orifice_seal",
                "label": "Nozzle membrane seal",
                "detail": "Puncture membrane intact before first use, uniform crimp on tube tail.",
                "kind": "specific",
            }
        ],
    },
]


def upgrade() -> None:
    # 1. Add variant column with default ''
    op.add_column(
        "packaging_checklists",
        sa.Column("variant", sa.String(length=60), server_default="", nullable=False),
    )

    # 2. Re-create primary key as (category, variant)
    op.drop_constraint("packaging_checklists_pkey", "packaging_checklists", type_="primary")
    op.create_primary_key("packaging_checklists_pkey", "packaging_checklists", ["category", "variant"])

    # 3. Upsert default & variant checklists
    conn = op.get_bind()
    upsert_sql = sa.text("""
        INSERT INTO packaging_checklists (category, variant, inspection_points, expected_reg_prefix, updated_at)
        VALUES (:category, :variant, CAST(:points AS jsonb), :prefix, now())
        ON CONFLICT (category, variant) DO UPDATE
        SET inspection_points = EXCLUDED.inspection_points,
            expected_reg_prefix = EXCLUDED.expected_reg_prefix,
            updated_at = now()
    """)
    for v in SEEDED_VARIANTS:
        conn.execute(
            upsert_sql,
            {
                "category": v["category"],
                "variant": v["variant"],
                "points": json.dumps(v["points"]),
                "prefix": v["prefix"],
            },
        )


def downgrade() -> None:
    # 1. Remove specific variants
    op.execute("DELETE FROM packaging_checklists WHERE variant != ''")

    # 2. Revert primary key to (category)
    op.drop_constraint("packaging_checklists_pkey", "packaging_checklists", type_="primary")
    op.create_primary_key("packaging_checklists_pkey", "packaging_checklists", ["category"])

    # 3. Drop variant column
    op.drop_column("packaging_checklists", "variant")
