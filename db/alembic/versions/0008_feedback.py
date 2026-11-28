"""Feedback: bug reports, wrong-data reports, ideas and helpful yes/no votes

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-28
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No accounts: a person is only a hashed anonymous device id and a salted hash of the IP.
    # `contact` is optional and personal data, so it is never logged.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS feedback (
            id          BIGSERIAL PRIMARY KEY,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            kind        TEXT NOT NULL CHECK (
                kind IN ('bug', 'wrong_data', 'idea', 'other', 'helpful_yes', 'helpful_no')
            ),
            message     TEXT,
            contact     TEXT,
            screen      TEXT,
            reg_number  TEXT,
            query       TEXT,
            app_version TEXT,
            device_hash TEXT NOT NULL,
            ip_hash     TEXT NOT NULL,
            user_agent  TEXT,
            status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done'))
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_feedback_created_at ON feedback (created_at)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_feedback_device_created ON feedback (device_hash, created_at)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_feedback_ip_created ON feedback (ip_hash, created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS feedback")
