"""add email notifications

Revision ID: f3a2b1c0d9e8
Revises: 12dfc95ce238
Create Date: 2026-05-26 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a2b1c0d9e8'
down_revision = '12dfc95ce238'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'email_notifications_enabled',
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ))

    with op.batch_alter_table('plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('email_sent_date', sa.Date(), nullable=True))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('email_notifications_enabled')

    with op.batch_alter_table('plans', schema=None) as batch_op:
        batch_op.drop_column('email_sent_date')
