"""add profile_customized to users

Revision ID: a1b2c3d4e5f6
Revises: f3a2b1c0d9e8
Create Date: 2026-07-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '00633cd5d0e8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('profile_customized', sa.Boolean(), nullable=False, server_default='0'))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('profile_customized')
