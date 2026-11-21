"""add registration dates, pack metadata and safety alert link table

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Product date & pack metadata columns
    op.add_column("products", sa.Column("registered_on", sa.Date(), nullable=True))
    op.add_column("products", sa.Column("expires_on", sa.Date(), nullable=True))
    op.add_column("products", sa.Column("pack_type", sa.String(length=40), nullable=True))
    op.add_column("products", sa.Column("pack_size", sa.String(length=120), nullable=True))
    op.add_column("products", sa.Column("dosage_form", sa.String(length=60), nullable=True))
    op.create_index("idx_products_expires_on", "products", ["expires_on"])
    op.create_index("idx_products_pack_type", "products", ["pack_type"])

    # 2. Safety alert title column
    op.add_column("safety_alerts", sa.Column("title", sa.String(length=500), nullable=True))

    # 3. Many-to-many link table: safety_alert_products
    op.create_table(
        "safety_alert_products",
        sa.Column("alert_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["safety_alerts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("alert_id", "product_id"),
    )
    op.create_index("idx_sap_product_id", "safety_alert_products", ["product_id"])


def downgrade() -> None:
    op.drop_index("idx_sap_product_id", table_name="safety_alert_products")
    op.drop_table("safety_alert_products")
    op.drop_column("safety_alerts", "title")
    op.drop_index("idx_products_pack_type", table_name="products")
    op.drop_index("idx_products_expires_on", table_name="products")
    op.drop_column("products", "dosage_form")
    op.drop_column("products", "pack_size")
    op.drop_column("products", "pack_type")
    op.drop_column("products", "expires_on")
    op.drop_column("products", "registered_on")
