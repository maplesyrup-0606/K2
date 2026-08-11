"""add comments

Revision ID: 26d20488cd68
Revises: 45b34ebc0240
Create Date: 2026-08-10 16:55:30.975349

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '26d20488cd68'
down_revision = '45b34ebc0240'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('reply_to_user_id', sa.Integer(), nullable=True),
        sa.Column('body', sa.String(length=500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['parent_id'], ['comments.id'], ),
        sa.ForeignKeyConstraint(['reply_to_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('comments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_comments_post_id'), ['post_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_comments_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_comments_parent_id'), ['parent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_comments_created_at'), ['created_at'], unique=False)

    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('comment_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_notifications_comment_id_comments', 'comments', ['comment_id'], ['id'])
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum(
                'reaction', 'plan_join', 'follow', 'plan_invite', name='notification_type',
            ),
            type_=sa.Enum(
                'reaction', 'plan_join', 'follow', 'plan_invite', 'comment', 'comment_reply',
                name='notification_type',
            ),
            existing_nullable=False,
        )


def downgrade():
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum(
                'reaction', 'plan_join', 'follow', 'plan_invite', 'comment', 'comment_reply',
                name='notification_type',
            ),
            type_=sa.Enum(
                'reaction', 'plan_join', 'follow', 'plan_invite', name='notification_type',
            ),
            existing_nullable=False,
        )
        batch_op.drop_constraint('fk_notifications_comment_id_comments', type_='foreignkey')
        batch_op.drop_column('comment_id')

    with op.batch_alter_table('comments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_comments_created_at'))
        batch_op.drop_index(batch_op.f('ix_comments_parent_id'))
        batch_op.drop_index(batch_op.f('ix_comments_user_id'))
        batch_op.drop_index(batch_op.f('ix_comments_post_id'))

    op.drop_table('comments')
