"""create products, safety_alerts, packaging_checklists"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.execute("""
    CREATE TABLE products (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nafdac_reg_num      VARCHAR(50)  NOT NULL UNIQUE,
        normalized_reg_num  VARCHAR(50)  GENERATED ALWAYS AS
            (upper(regexp_replace(nafdac_reg_num, '[^A-Za-z0-9]', '', 'g'))) STORED NOT NULL,
        product_name        VARCHAR(255) NOT NULL,
        brand_name          VARCHAR(150),
        category            VARCHAR(50)  NOT NULL,
        manufacturer        VARCHAR(255) NOT NULL,
        status              VARCHAR(30)  NOT NULL DEFAULT 'Active',
        external_image_url  TEXT,
        source_portal       VARCHAR(50)  NOT NULL,
        last_synced_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT ck_products_status
            CHECK (status IN ('Active','Expired','Alert_Flagged')),
        CONSTRAINT ck_products_category
            CHECK (category IN ('Food','Beverage','Toothpaste','Cosmetic','OTC')),
        CONSTRAINT ck_products_source
            CHECK (source_portal IN ('FoodDB','NAPAMS','Greenbook','Gazette')),
        CONSTRAINT ck_products_image_https
            CHECK (external_image_url IS NULL OR external_image_url ~* '^https://')
    )""")
    op.execute("CREATE INDEX idx_products_norm_reg ON products (normalized_reg_num)")
    op.execute("CREATE INDEX idx_products_name_trgm ON products USING GIN (product_name gin_trgm_ops)")
    op.execute("CREATE INDEX idx_products_category ON products (category)")

    op.execute("""
    CREATE TABLE safety_alerts (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        alert_reference_no  VARCHAR(100) NOT NULL UNIQUE,
        nafdac_reg_num      VARCHAR(50)
            REFERENCES products (nafdac_reg_num) ON DELETE SET NULL,
        product_name        VARCHAR(255) NOT NULL,
        batch_numbers       VARCHAR(255),
        summary             TEXT NOT NULL,
        official_source_url TEXT NOT NULL,
        issued_date         DATE NOT NULL,
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    op.execute("CREATE INDEX idx_alerts_active_date ON safety_alerts (is_active, issued_date DESC)")
    op.execute("CREATE INDEX idx_alerts_reg ON safety_alerts (nafdac_reg_num)")

    op.execute("""
    CREATE TABLE packaging_checklists (
        category            VARCHAR(50) PRIMARY KEY,
        inspection_points   JSONB       NOT NULL,
        expected_reg_prefix VARCHAR(50) NOT NULL,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS packaging_checklists")
    op.execute("DROP TABLE IF EXISTS safety_alerts")
    op.execute("DROP TABLE IF EXISTS products")
