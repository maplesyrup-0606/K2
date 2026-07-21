"""add bio and social links

Revision ID: 45b34ebc0240
Revises: 29a9f49aab2d
Create Date: 2026-07-20 22:20:40.832997

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '45b34ebc0240'
down_revision = '29a9f49aab2d'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('bio', sa.String(length=160), nullable=True))

    op.create_table(
        'social_links',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('platform', sa.Enum('instagram', name='social_platform'), nullable=False),
        sa.Column('handle', sa.String(length=60), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('user_id', 'platform'),
    )


def downgrade():
    op.drop_table('social_links')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('bio')
