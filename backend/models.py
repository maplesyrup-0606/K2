from flask_login import UserMixin
from datetime import datetime, timezone
from app import db

GRADE_SCALE = db.Enum('v', 'comp', name='grade_scale')


class User(db.Model, UserMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    google_sub = db.Column(db.String(255), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(120), nullable=False)
    avatar_url = db.Column(db.String(500))
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    is_onboarded = db.Column(db.Boolean, nullable=False, default=False)
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
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))

    # relations
    user = db.relationship('User', backref='posts')
    project = db.relationship('Project', backref='posts')

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


class InviteAllowList(db.Model):
    __tablename__ = 'inviteallowlist'

    email = db.Column(db.String(255), primary_key=True)
    invited_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
