"""Cross-domain helpers shared by two or more blueprint modules: payload
serializers, small pure-logic functions, and the module constants they rely
on. Moved verbatim out of app.py — no behavior changes."""
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from functools import wraps

from flask_login import current_user

from extensions import db
from models import User, Post, Project, Gym, Reaction, Follow, Notification, SocialLink, Comment


def to_utc(dt):
    """Normalize a datetime to aware UTC (naive input is assumed to be UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_utc(dt):
    """ISO 8601 with explicit UTC offset. SQLite hands back naive datetimes
    for our stored-UTC columns; without the offset, browsers parse the string
    as device-local time and every timestamp shifts by the UTC offset."""
    return to_utc(dt).isoformat()


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return {'error':'unauthenticated'}, 401
        if not current_user.is_admin:
            return {'error': 'admin only'}, 403

        return f(*args, **kwargs)
    return decorated


def generate_unique_username():
    while True:
        candidate = f"user_{secrets.token_hex(4)}"
        if User.query.filter_by(username=candidate).first() is None:
            return candidate


def _instagram_handle(user):
    link = db.session.get(SocialLink, (user.id, 'instagram'))
    return link.handle if link is not None else None


def user_payload(user):
    return {
        'id': user.id,
        'email': user.email,
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url,
        'is_onboarded': user.is_onboarded,
        'is_admin': user.is_admin,
        'profile_customized': user.profile_customized,
        'bio': user.bio,
        'instagram_handle': _instagram_handle(user),
    }

def post_payload(post):
    reaction_rows = (
        db.session.query(Reaction, User)
        .join(User, User.id == Reaction.user_id)
        .filter(Reaction.post_id == post.id)
        .order_by(Reaction.created_at.asc())
        .all()
    )

    reactors = {}
    reaction_counts = {}
    my_reactions = []
    for reaction, user in reaction_rows:
        reactors.setdefault(reaction.emoji, []).append({
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name,
            'avatar_url': user.avatar_url,
        })
        reaction_counts[reaction.emoji] = reaction_counts.get(reaction.emoji, 0) + 1
        if reaction.user_id == current_user.id:
            my_reactions.append(reaction.emoji)
    return {
        'id': post.id,
        'user_id': post.user_id,
        'created_at': iso_utc(post.created_at),
        'climbed_at': iso_utc(post.climbed_at),
        'grade_scale': post.grade_scale,
        'grade_value': post.grade_value,
        'outcome': post.outcome,
        'attempts_bucket': post.attempts_bucket,
        'photo_path': post.photo_path,
        'notes': post.notes,
        'hold_color': post.hold_color,
        'project_id': post.project_id,
        'gym': {
            'id': post.gym.id,
            'name': post.gym.name,
            'city': post.gym.city,
            'country': post.gym.country,
        } if post.gym else None,
        'is_flash': post.outcome == 'sent' and post.attempts_bucket == '1',
        'user': {
            'id': post.user.id,
            'username': post.user.username,
            'display_name': post.user.display_name,
            'avatar_url': post.user.avatar_url,
        },
        'reaction_counts': reaction_counts,
        'my_reactions': my_reactions,
        'reactors': reactors,
        'comment_count': Comment.query.filter_by(post_id=post.id).count(),
    }


def _comment_user_payload(user):
    return {
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url,
    }


def comment_payload(comment):
    return {
        'id': comment.id,
        'post_id': comment.post_id,
        'parent_id': comment.parent_id,
        'body': comment.body,
        'created_at': iso_utc(comment.created_at),
        'edited_at': iso_utc(comment.edited_at) if comment.edited_at else None,
        'user': _comment_user_payload(comment.user),
        'reply_to_user': _comment_user_payload(comment.reply_to_user) if comment.reply_to_user else None,
    }

ATTEMPTS_LOWER = {'1': 1, '2': 2, '3-4': 3, '5-9': 5, '10+': 10}
PROJECT_LIFETIME_DAYS = 30

def project_payload(project, include_posts=False):
    posts_q = Post.query.filter_by(project_id=project.id).order_by(
        Post.climbed_at.desc(), Post.id.desc()
    )
    posts = posts_q.all()

    sessions_count = len(posts)
    attempts_lower = sum(ATTEMPTS_LOWER.get(p.attempts_bucket, 0) for p in posts)

    expires_at = to_utc(project.created_at) + timedelta(days=PROJECT_LIFETIME_DAYS)
    is_expired = datetime.now(timezone.utc) > expires_at

    payload = {
        'id': project.id,
        'user_id': project.user_id,
        'title': project.title,
        'photo_path': project.photo_path,
        'grade_scale': project.grade_scale,
        'grade_value': project.grade_value,
        'status': project.status,
        'created_at': iso_utc(project.created_at),
        'closed_at': iso_utc(project.closed_at) if project.closed_at else None,
        'expires_at': iso_utc(expires_at),
        'is_expired': is_expired,
        'sessions': sessions_count,
        'attempts_lower_bound': attempts_lower,
    }
    if include_posts:
        payload['posts'] = [post_payload(p) for p in posts]
    return payload


def normalize_instagram_handle(raw):
    """Accepts a bare handle, an @handle, or a pasted profile URL."""
    value = raw.strip()
    if not value:
        return ''
    match = re.search(r'instagram\.com/([a-zA-Z0-9_.]{1,30})', value)
    if match:
        return match.group(1)
    return value[1:] if value.startswith('@') else value


def _follow_state(user):
    return {
        'follower_count': Follow.query.filter_by(followed_id=user.id).count(),
        'following_count': Follow.query.filter_by(follower_id=user.id).count(),
        'is_following': db.session.get(Follow, (current_user.id, user.id)) is not None,
    }


def _fuzzy_subsequence(q, text):
    """True if the chars of q appear in text in order (editor-style fuzzy find)."""
    pos = 0
    for ch in q:
        pos = text.find(ch, pos)
        if pos == -1:
            return False
        pos += 1
    return True


VALID_OUTCOMES = {'sent', 'projecting', 'gave_up'}
VALID_ATTEMPTS = {'1', '2', '3-4', '5-9', '10+'}
GRADE_RANGES = {'v': (0, 12), 'comp': (1, 4)}
ALLOWED_MIMES = {
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
}

def sync_project_status(project, outcome):
    # Logging a terminal outcome against an active project closes it, so it
    # shows up under the profile's Sent/Abandoned filters without a manual
    # status change. Re-opening stays explicit (ProjectPage button).
    if project is None or project.status != 'active':
        return
    if outcome == 'sent':
        project.status = 'sent'
        project.closed_at = datetime.now(timezone.utc)
    elif outcome == 'gave_up':
        project.status = 'abandoned'
        project.closed_at = datetime.now(timezone.utc)


def gym_payload(gym):
    return {
        'id': gym.id,
        'name': gym.name,
        'city': gym.city,
        'country': gym.country,
        'created_at': iso_utc(gym.created_at)
    }


def plan_payload(plan):
    return {
        'id': plan.id,
        'created_at': iso_utc(plan.created_at),
        'planned_at': iso_utc(plan.planned_at),
        'note': plan.note,
        'gym': {
            'id': plan.gym.id,
            'name': plan.gym.name,
            'city': plan.gym.city,
            'country': plan.gym.country,
        },
        'organizer': {
            'id': plan.user.id,
            'username': plan.user.username,
            'display_name': plan.user.display_name,
            'avatar_url': plan.user.avatar_url,
        },
        'attendees': [
            {
                'id': pa.user.id,
                'username': pa.user.username,
                'display_name': pa.user.display_name,
                'avatar_url': pa.user.avatar_url,
            }
            for pa in plan.attendees
        ],
        'invited': [
            {
                'id': pi.user.id,
                'username': pi.user.username,
                'display_name': pi.user.display_name,
                'avatar_url': pi.user.avatar_url,
            }
            for pi in plan.invites
        ],
    }


def prune_notifications(user_id, keep=50):
    keep_ids = [n.id for n in (
        Notification.query
        .filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc())
        .limit(keep)
        .all()
    )]
    if len(keep_ids) == keep:
        Notification.query.filter(
            Notification.user_id == user_id,
            ~Notification.id.in_(keep_ids)
        ).delete(synchronize_session=False)

def notification_payload(n):
    return {
        'id': n.id,
        'type': n.type,
        'is_read': n.is_read,
        'created_at': iso_utc(n.created_at),
        'actor': {
            'id': n.actor.id,
            'username': n.actor.username,
            'display_name': n.actor.display_name,
            'avatar_url': n.actor.avatar_url,
        },
        'post_id': n.post_id,
        'plan_id': n.plan_id,
        'comment_id': n.comment_id,
        'emoji': n.emoji,
    }
