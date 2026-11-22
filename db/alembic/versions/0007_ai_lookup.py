"""AI lookup: answer cache and daily usage counters

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-22
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # One row per distinct question (normalised) so the paid provider is never asked twice.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_lookups (
            query_key      TEXT PRIMARY KEY,
            query_text     TEXT NOT NULL,
            prompt_version INTEGER NOT NULL,
            status         TEXT NOT NULL CHECK (status IN ('ok', 'none')),
            result         JSONB NOT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at     TIMESTAMPTZ NOT NULL,
            hit_count      INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ai_lookups_expires ON ai_lookups (expires_at)")
    # Daily counters per scope: an anonymous device id, a salted hash of the IP, or the whole app.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_usage (
            scope TEXT    NOT NULL CHECK (scope IN ('device', 'ip', 'global')),
            key   TEXT    NOT NULL,
            day   DATE    NOT NULL,
            count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
            PRIMARY KEY (scope, key, day)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ai_usage_day ON ai_usage (day)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_usage")
    op.execute("DROP TABLE IF EXISTS ai_lookups")
