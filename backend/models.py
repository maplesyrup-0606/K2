from flask_login import UserMixin
from datetime import datetime, timezone
from extensions import db

GRADE_SCALE = db.Enum('v', 'comp', name='grade_scale')


class User(db.Model, UserMixin):
    __tablename__ = 'users'

    id = db.Column(
        db.Integer, 
        primary_key=True
    )
    
    google_sub = db.Column(
        db.String(255), 
        unique=True, 
        nullable=False, 
        index=True
    )
    
    email = db.Column(
        db.String(255), 
        unique=True, 
        nullable=False, 
        index=True
    )
    
    username = db.Column(
        db.String(64), 
        unique=True, 
        nullable=False, 
        index=True
    )
    
    display_name = db.Column(
        db.String(120), 
        nullable=False
    )
    
    avatar_url = db.Column(db.String(500))
    
    is_admin = db.Column(
        db.Boolean, 
        nullable=False, 
        default=False
    )
    
    is_onboarded = db.Column(
        db.Boolean,
        nullable=False,
        default=False
    )

    profile_customized = db.Column(
        db.Boolean,
        nullable=False,
        default=False
    )

    bio = db.Column(db.String(160), nullable=True)

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self):
        return f'<User {self.username}>'


class Post(db.Model):
    __tablename__ = 'posts'

    id = db.Column(db.Integer, primary_key=True)
    
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        nullable=False,
        index=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    climbed_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        index=True,
        default=lambda: datetime.now(timezone.utc),
    )
    grade_scale = db.Column(GRADE_SCALE, nullable=False)
    grade_value = db.Column(db.Integer, nullable=False)
    outcome = db.Column(
        db.Enum('sent', 'projecting', 'gave_up', name='post_outcome'),
        nullable=False,
    )
    attempts_bucket = db.Column(
        db.Enum('1', '2', '3-4', '5-9', '10+', name='attempts_bucket'),
        nullable=False,
    )
    photo_path = db.Column(db.String(500), nullable=False)
    notes = db.Column(db.Text)
    hold_color = db.Column(db.String(7), nullable=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))
    gym_id = db.Column(db.Integer, db.ForeignKey('gyms.id'))

    # relations
    user = db.relationship('User', backref='posts')
    project = db.relationship('Project', backref='posts')
    gym = db.relationship('Gym')

class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(120), nullable=False)
    photo_path = db.Column(db.String(500), nullable=False)
    grade_scale = db.Column(GRADE_SCALE, nullable=False)
    grade_value = db.Column(db.Integer, nullable=False)
    status = db.Column(
        db.Enum('active', 'sent', 'abandoned', name='project_status'),
        nullable=False,
        default='active',
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    closed_at = db.Column(db.DateTime(timezone=True))


class Reaction(db.Model):
    __tablename__ = 'reactions'

    post_id = db.Column(db.Integer, db.ForeignKey('posts.id'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    emoji = db.Column(db.String(16), primary_key=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Comment(db.Model):
    __tablename__ = 'comments'

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(
        db.Integer,
        db.ForeignKey('posts.id'),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        nullable=False,
        index=True,
    )
    # Always points at a top-level comment (never at another reply) — this is
    # what keeps replies flat at one level deep. See routes_comments.py.
    parent_id = db.Column(
        db.Integer,
        db.ForeignKey('comments.id'),
        nullable=True,
        index=True,
    )
    # Who to @mention/notify — may differ from parent's author when replying
    # to a reply (the reply is flattened under parent, but credit still goes
    # to whoever was actually tapped "reply" on).
    reply_to_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    body = db.Column(db.String(500), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    edited_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # relations
    post = db.relationship('Post', backref='comments')
    user = db.relationship('User', foreign_keys=[user_id])
    reply_to_user = db.relationship('User', foreign_keys=[reply_to_user_id])


class InviteAllowList(db.Model):
    __tablename__ = 'inviteallowlist'

    email = db.Column(db.String(255), primary_key=True)
    invited_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

class Gym(db.Model):
    __tablename__ = 'gyms'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    city = db.Column(db.String(120))
    country = db.Column(db.String(120))
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self):
        return f'<Gym {self.name}>'


class Plan(db.Model):
    __tablename__ = 'plans'

    id = db.Column(db.Integer, primary_key=True)
    # organizer
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        nullable=False,
        index=True,
    )
    gym_id = db.Column(
        db.Integer,
        db.ForeignKey('gyms.id'),
        nullable=False,
        index=True,
    )
    note = db.Column(db.Text)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    planned_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # relations
    user = db.relationship('User', backref='plans')
    gym = db.relationship('Gym', backref='plans')


class PlanAttendee(db.Model):
    __tablename__ = 'plan_attendees'

    plan_id = db.Column(
        db.Integer,
        db.ForeignKey('plans.id'),
        primary_key=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        primary_key=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # relations
    plan = db.relationship('Plan', backref='attendees')
    user = db.relationship('User')


class PlanInvite(db.Model):
    __tablename__ = 'plan_invites'

    plan_id = db.Column(
        db.Integer,
        db.ForeignKey('plans.id'),
        primary_key=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        primary_key=True,
        index=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # relations
    plan = db.relationship('Plan', backref='invites')
    user = db.relationship('User')

class Follow(db.Model):
    __tablename__ = 'follows'

    follower_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        primary_key=True,
    )
    followed_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        primary_key=True,
        index=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # relations
    follower = db.relationship('User', foreign_keys=[follower_id])
    followed = db.relationship('User', foreign_keys=[followed_id])


class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        nullable=False,
        index=True,
    )
    actor_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        nullable=False,
    )
    type = db.Column(
        db.Enum(
            'reaction', 'plan_join', 'follow', 'plan_invite', 'comment', 'comment_reply',
            name='notification_type',
        ),
        nullable=False,
    )
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id'))
    plan_id = db.Column(db.Integer, db.ForeignKey('plans.id'))
    comment_id = db.Column(db.Integer, db.ForeignKey('comments.id'))
    emoji = db.Column(db.String(16))
    is_read = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
        index=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # relations
    actor = db.relationship('User', foreign_keys=[actor_id])
    post = db.relationship('Post', foreign_keys=[post_id])
    plan = db.relationship('Plan', foreign_keys=[plan_id])
    comment = db.relationship('Comment', foreign_keys=[comment_id])


class SocialLink(db.Model):
    __tablename__ = 'social_links'

    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        primary_key=True,
    )
    platform = db.Column(
        db.Enum('instagram', name='social_platform'),
        primary_key=True,
    )
    handle = db.Column(db.String(60), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # relations
    user = db.relationship('User', backref='social_links')