"""record where each product image came from and when it was last checked

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-21
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_source_page TEXT")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_score REAL")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ")
    op.execute(
        "ALTER TABLE products ADD CONSTRAINT ck_products_image_score "
        "CHECK (image_score IS NULL OR (image_score >= 0 AND image_score <= 1))"
    )
    op.execute(
        "ALTER TABLE products ADD CONSTRAINT ck_products_image_source_https "
        "CHECK (image_source_page IS NULL OR image_source_page ~* '^https?://')"
    )
    # Speeds up "which products still need an image search" without scanning every row.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_products_image_pending "
        "ON products (category, image_checked_at) WHERE external_image_url IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_products_image_pending")
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS ck_products_image_source_https")
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS ck_products_image_score")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS image_checked_at")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS image_score")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS image_source_page")
