"""add password auth fields, apple_sub, relax google_sub

Revision ID: 9c1d4e7a2b3f
Revises: 26d20488cd68
Create Date: 2026-08-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9c1d4e7a2b3f'
down_revision = '26d20488cd68'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('google_sub',
               existing_type=sa.VARCHAR(length=255),
               nullable=True)
        batch_op.add_column(sa.Column('apple_sub', sa.String(length=255), nullable=True))
        batch_op.create_unique_constraint('uq_users_apple_sub', ['apple_sub'])
        batch_op.create_index(batch_op.f('ix_users_apple_sub'), ['apple_sub'], unique=False)
        batch_op.add_column(sa.Column('password_hash', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column(
            'email_verified', sa.Boolean(), nullable=False, server_default=sa.true()
        ))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('email_verified')
        batch_op.drop_column('password_hash')
        batch_op.drop_index(batch_op.f('ix_users_apple_sub'))
        batch_op.drop_constraint('uq_users_apple_sub', type_='unique')
        batch_op.drop_column('apple_sub')
        batch_op.alter_column('google_sub',
               existing_type=sa.VARCHAR(length=255),
               nullable=False)
