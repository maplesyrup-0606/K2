"""add follow and plan invite notifications

Revision ID: 29a9f49aab2d
Revises: cc512cc39fa9
Create Date: 2026-07-20 21:44:08.788686

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '29a9f49aab2d'
down_revision = 'cc512cc39fa9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'plan_invites',
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('plan_id', 'user_id'),
    )
    with op.batch_alter_table('plan_invites', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_plan_invites_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum('reaction', 'plan_join', name='notification_type'),
            type_=sa.Enum('reaction', 'plan_join', 'follow', 'plan_invite', name='notification_type'),
            existing_nullable=False,
        )

    with op.batch_alter_table('plans', schema=None) as batch_op:
        batch_op.drop_column('email_sent_date')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('email_notifications_enabled')


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'email_notifications_enabled',
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ))

    with op.batch_alter_table('plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('email_sent_date', sa.Date(), nullable=True))

    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum('reaction', 'plan_join', 'follow', 'plan_invite', name='notification_type'),
            type_=sa.Enum('reaction', 'plan_join', name='notification_type'),
            existing_nullable=False,
        )

    with op.batch_alter_table('plan_invites', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_plan_invites_user_id'))

    op.drop_table('plan_invites')
