"""replace projects with day-based sessions

Adds posts.climbed_on (the poster's local calendar day, backfilled from
climbed_at), users.tz_name and the session_covers table, and drops the
projects feature (posts.project_id and the projects table).

Revision ID: d1a5e7c93b20
Revises: 2a473730c1bf
Create Date: 2026-10-15 13:00:00.000000

"""
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1a5e7c93b20'
down_revision = '2a473730c1bf'
branch_labels = None
depends_on = None

# No user has a stored timezone yet, so existing posts are bucketed into days
# using this zone.
BACKFILL_TIMEZONE = 'America/Vancouver'


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tz_name', sa.String(length=64), nullable=True))

    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('climbed_on', sa.Date(), nullable=True))

    posts = sa.table(
        'posts',
        sa.column('id', sa.Integer),
        sa.column('climbed_at', sa.DateTime(timezone=True)),
        sa.column('climbed_on', sa.Date),
    )
    connection = op.get_bind()
    zone = ZoneInfo(BACKFILL_TIMEZONE)
    for post_id, climbed_at in connection.execute(sa.select(posts.c.id, posts.c.climbed_at)).all():
        if climbed_at.tzinfo is None:
            climbed_at = climbed_at.replace(tzinfo=dt_timezone.utc)
        connection.execute(
            posts.update()
            .where(posts.c.id == post_id)
            .values(climbed_on=climbed_at.astimezone(zone).date())
        )

    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.alter_column('climbed_on', existing_type=sa.Date(), nullable=False)
        batch_op.create_index(batch_op.f('ix_posts_climbed_on'), ['climbed_on'], unique=False)

    op.create_table(
        'session_covers',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('user_id', 'session_date'),
    )

    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.drop_column('project_id')
    op.drop_table('projects')


def downgrade():
    # Project rows are not recoverable; this restores the empty schema only.
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('photo_path', sa.String(length=500), nullable=False),
        sa.Column('grade_scale', sa.Enum('v', 'comp', name='grade_scale'), nullable=False),
        sa.Column('grade_value', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('active', 'sent', 'abandoned', name='project_status'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('projects', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_projects_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('project_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_posts_project_id_projects', 'projects', ['project_id'], ['id'])

    op.drop_table('session_covers')

    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_posts_climbed_on'))
        batch_op.drop_column('climbed_on')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('tz_name')
