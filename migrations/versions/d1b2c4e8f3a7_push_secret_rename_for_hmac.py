"""accounts: rename push_webhook_secret_hash → push_webhook_secret

Revision ID: d1b2c4e8f3a7
Revises: 27ba4a768725
Create Date: 2026-05-08 15:50:00.000000

The previous column name implied we'd hash the secret at rest (matching
the bearer-token pattern). But HMAC-signing webhook payloads requires
the raw secret at delivery time — server *signs* with it, receiver
*verifies* by computing the same HMAC. Both sides need the raw value.

For v1: store plaintext. The trust model: an attacker with DB read
access could forge webhook deliveries to recipient daemons, but cannot
escalate beyond that (the daemon's wake action is bounded by what the
recipient already does with their own context). For v2: encrypt at
rest with a server-side key.

Rename rather than add new column + drop old, since no rows had data
populated yet (column was shipped this morning, only test toggling
happened).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1b2c4e8f3a7'
down_revision: Union[str, Sequence[str], None] = '27ba4a768725'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('accounts', schema=None) as batch_op:
        batch_op.alter_column(
            'push_webhook_secret_hash',
            new_column_name='push_webhook_secret',
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('accounts', schema=None) as batch_op:
        batch_op.alter_column(
            'push_webhook_secret',
            new_column_name='push_webhook_secret_hash',
        )
