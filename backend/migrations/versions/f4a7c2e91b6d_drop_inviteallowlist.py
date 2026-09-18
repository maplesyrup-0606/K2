"""drop inviteallowlist

Revision ID: f4a7c2e91b6d
Revises: 9c1d4e7a2b3f
Create Date: 2026-09-17 21:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f4a7c2e91b6d'
down_revision = '9c1d4e7a2b3f'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('inviteallowlist')


def downgrade():
    op.create_table('inviteallowlist',
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('invited_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['invited_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('email')
    )
