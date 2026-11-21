"""allow several products to share one NAFDAC registration number

NAFDAC portals assign the same registration number to more than one product name
(e.g. flavour variants). A UNIQUE(nafdac_reg_num) key silently dropped all but one of them.
Identity becomes (nafdac_reg_num, lower(btrim(product_name))).

The FK from safety_alerts.nafdac_reg_num is dropped because it needs a unique parent column;
alerts keep the plain registration number (indexed) and the ETL flags every matching product.
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE safety_alerts DROP CONSTRAINT IF EXISTS safety_alerts_nafdac_reg_num_fkey")
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_nafdac_reg_num_key")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_products_reg_name "
        "ON products (nafdac_reg_num, (lower(btrim(product_name))))"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_products_reg ON products (nafdac_reg_num)")


def downgrade() -> None:
    # Keep the most recently synced product per registration number, then restore the old key.
    op.execute(
        "DELETE FROM products p USING products q "
        "WHERE p.nafdac_reg_num = q.nafdac_reg_num AND p.id <> q.id "
        "AND (p.last_synced_at, p.id) < (q.last_synced_at, q.id)"
    )
    op.execute("DROP INDEX IF EXISTS idx_products_reg")
    op.execute("DROP INDEX IF EXISTS uq_products_reg_name")
    op.execute("ALTER TABLE products ADD CONSTRAINT products_nafdac_reg_num_key UNIQUE (nafdac_reg_num)")
    op.execute(
        "ALTER TABLE safety_alerts ADD CONSTRAINT safety_alerts_nafdac_reg_num_fkey "
        "FOREIGN KEY (nafdac_reg_num) REFERENCES products(nafdac_reg_num) ON DELETE SET NULL"
    )
