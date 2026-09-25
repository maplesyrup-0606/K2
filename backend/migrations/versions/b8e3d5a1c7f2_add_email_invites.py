"""add email_invites

Revision ID: b8e3d5a1c7f2
Revises: f4a7c2e91b6d
Create Date: 2026-09-24 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8e3d5a1c7f2'
down_revision = 'f4a7c2e91b6d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('email_invites',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('inviter_id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['inviter_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('email_invites', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_email_invites_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_email_invites_inviter_id'), ['inviter_id'], unique=False)


def downgrade():
    with op.batch_alter_table('email_invites', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_email_invites_inviter_id'))
        batch_op.drop_index(batch_op.f('ix_email_invites_created_at'))

    op.drop_table('email_invites')
