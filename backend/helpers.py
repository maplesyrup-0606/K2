"""Cross-domain helpers shared by two or more blueprint modules: payload
serializers, small pure-logic functions, and the module constants they rely
on. Moved verbatim out of app.py — no behavior changes."""
import json
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from functools import wraps
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import current_app
from flask_login import current_user
from itsdangerous import URLSafeTimedSerializer
from pywebpush import webpush, WebPushException

from emailer import run_in_background
from extensions import db
from models import User, Post, SessionCover, Gym, Reaction, Follow, Notification, SocialLink, Comment, PushSubscription


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


EMAIL_VERIFY_MAX_AGE = 60 * 60 * 24 * 3  # 3 days
PASSWORD_RESET_MAX_AGE = 60 * 60  # 1 hour


def _token_serializer(salt):
    # Distinct salt per token purpose so a leaked verification-link token
    # can never be replayed as a password-reset token, or vice versa.
    return URLSafeTimedSerializer(current_app.config['SECRET_KEY'], salt=salt)


def make_email_verify_token(user):
    return _token_serializer('email-verify').dumps({'uid': user.id, 'email': user.email})


def read_email_verify_token(token):
    """Returns {'uid', 'email'}; raises BadSignature/SignatureExpired on failure."""
    return _token_serializer('email-verify').loads(token, max_age=EMAIL_VERIFY_MAX_AGE)


def make_password_reset_token(user):
    return _token_serializer('pwd-reset').dumps({'uid': user.id, 'email': user.email})


def read_password_reset_token(token):
    """Returns {'uid', 'email'}; raises BadSignature/SignatureExpired on failure."""
    return _token_serializer('pwd-reset').loads(token, max_age=PASSWORD_RESET_MAX_AGE)


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
        'timezone': user.tz_name,
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
        'climbed_on': post.climbed_on.isoformat(),
        'grade_scale': post.grade_scale,
        'grade_value': post.grade_value,
        'outcome': post.outcome,
        'attempts_bucket': post.attempts_bucket,
        'photo_path': post.photo_path,
        'notes': post.notes,
        'hold_color': post.hold_color,
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


DEFAULT_TIMEZONE = 'America/Vancouver'


def valid_timezone(name):
    """Returns name if it is a known IANA zone, else None."""
    if not isinstance(name, str) or not name or len(name) > 64:
        return None
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return None
    return name


def local_day(moment, tz_name):
    """Calendar date of a moment in the given zone (falls back to the default)."""
    zone = ZoneInfo(valid_timezone(tz_name) or DEFAULT_TIMEZONE)
    return to_utc(moment).astimezone(zone).date()


VALID_OUTCOMES = {'sent', 'projecting', 'gave_up'}
VALID_ATTEMPTS = {'1', '2', '3-4', '5-9', '10+'}
GRADE_RANGES = {'v': (0, 12), 'comp': (1, 4)}
ALLOWED_MIMES = {
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
}

def gym_payload(gym, is_favorite=False):
    return {
        'id': gym.id,
        'name': gym.name,
        'city': gym.city,
        'country': gym.country,
        'created_at': iso_utc(gym.created_at),
        'is_favorite': is_favorite,
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


def _send_push_sync(user_id, title, body, tag, url):
    # Runs on a bare background thread (via run_in_background), which has no
    # Flask application/request context of its own — push a fresh one so the
    # ORM queries below have a session to run against. Deferred import: app.py
    # imports helpers at module load time, before `app` is defined, so a
    # top-level `from app import app` here would be circular.
    from app import app as flask_app
    with flask_app.app_context():
        subscriptions = PushSubscription.query.filter_by(user_id=user_id).all()
        if not subscriptions:
            return
        vapid_private_key = os.getenv('VAPID_PRIVATE_KEY')
        vapid_claims_email = os.getenv('VAPID_CLAIMS_EMAIL', 'mercurymcindoe@gmail.com')
        if not vapid_private_key:
            print('[push] skipped — VAPID_PRIVATE_KEY not set')
            return
        payload = json.dumps({'title': title, 'body': body, 'tag': tag, 'url': url})
        for sub in subscriptions:
            try:
                webpush(
                    subscription_info={
                        'endpoint': sub.endpoint,
                        'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
                    },
                    data=payload,
                    vapid_private_key=vapid_private_key,
                    vapid_claims={'sub': f'mailto:{vapid_claims_email}'},
                )
            except WebPushException as e:
                status = e.response.status_code if e.response is not None else None
                if status in (404, 410):
                    # Subscription expired or was revoked browser-side — stop
                    # trying it rather than erroring on every future notification.
                    db.session.delete(sub)
                    db.session.commit()
                else:
                    print(f'[push] failed to send to user {user_id}: {e}')
            except Exception as e:
                print(f'[push] failed to send to user {user_id}: {e}')


def send_push(user_id, title, body, tag=None, url=None):
    """Fire-and-forget a push notification to every device `user_id` has
    subscribed on. Never raises — a slow/unreachable push service must not
    block the request that triggered it (same reasoning as emailer.py's
    SMTP calls), and a user with push disabled/unsupported is a no-op, not
    an error."""
    run_in_background(_send_push_sync, user_id, title, body, tag, url)
