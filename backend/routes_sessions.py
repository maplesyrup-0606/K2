"""Sessions: every post a user logged on one local calendar day.

A session is never stored — it is the group of posts sharing
(user_id, climbed_on). The only persisted piece is SessionCover, the cover
photo the user picked."""
from datetime import date

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy.orm import joinedload

from extensions import db
from models import User, Post, SessionCover, Follow
from helpers import ATTEMPTS_LOWER, iso_utc, post_payload

sessions_bp = Blueprint('sessions', __name__)

SESSIONS_MAX_LIMIT = 50
PREVIEW_PHOTO_LIMIT = 4
OUTCOME_RANK = {'sent': 0, 'projecting': 1, 'gave_up': 2}
# V-scale is the headline scale; comp grades only lead a day with no V climbs.
SCALE_RANK = {'v': 0, 'comp': 1}


def _difficulty_key(post):
    """Sort key where the smallest value is the hardest climb."""
    return (
        SCALE_RANK[post.grade_scale],
        -post.grade_value,
        OUTCOME_RANK[post.outcome],
        ATTEMPTS_LOWER[post.attempts_bucket],
    )


def _grade_summary(post):
    return {
        'post_id': post.id,
        'grade_scale': post.grade_scale,
        'grade_value': post.grade_value,
        'outcome': post.outcome,
        'attempts_bucket': post.attempts_bucket,
        'is_flash': post.outcome == 'sent' and post.attempts_bucket == '1',
    }


def _pick_gym(posts):
    counts = {}
    for post in posts:
        if post.gym is not None:
            counts[post.gym_id] = counts.get(post.gym_id, 0) + 1
    if not counts:
        return None
    # Most-logged gym wins; the earliest-logged one breaks a tie.
    best_id = max(counts, key=lambda gym_id: counts[gym_id])
    gym = next(p.gym for p in posts if p.gym_id == best_id)
    return {'id': gym.id, 'name': gym.name, 'city': gym.city, 'country': gym.country}


def session_payload(user, session_date, posts, chosen_cover_post_id):
    """posts: every post of `user` on `session_date`, any order."""
    posts = sorted(posts, key=lambda p: (p.climbed_at, p.id))
    sent = [p for p in posts if p.outcome == 'sent']
    hardest_sent = min(sent, key=_difficulty_key) if sent else None
    hardest_overall = min(posts, key=_difficulty_key)

    chosen = next((p for p in posts if p.id == chosen_cover_post_id), None)
    cover = chosen or hardest_overall

    return {
        'user': {
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name,
            'avatar_url': user.avatar_url,
        },
        'date': session_date.isoformat(),
        'gym': _pick_gym(posts),
        'climb_count': len(posts),
        'send_count': len(sent),
        'flash_count': sum(1 for p in sent if p.attempts_bucket == '1'),
        'hardest_sent': _grade_summary(hardest_sent) if hardest_sent else None,
        # What a tile leads with: the hardest send, or when nothing was sent,
        # the hardest attempt so the session still has a headline.
        'headline': _grade_summary(hardest_sent or hardest_overall),
        'cover': {
            'post_id': cover.id,
            'photo_path': cover.photo_path,
            'is_chosen': chosen is not None,
        },
        # A few of the day's other photos so a feed card can hint at the rest.
        'preview_photos': [p.photo_path for p in posts if p.id != cover.id][:PREVIEW_PHOTO_LIMIT],
        'last_climbed_at': iso_utc(posts[-1].climbed_at),
    }


def _sessions_for_groups(groups):
    """groups: [(user_id, climbed_on)]. Returns payloads in the same order."""
    if not groups:
        return []
    posts = Post.query.options(joinedload(Post.gym)).filter(
        db.or_(*[
            db.and_(Post.user_id == user_id, Post.climbed_on == climbed_on)
            for user_id, climbed_on in groups
        ])
    ).all()
    by_group = {}
    for post in posts:
        by_group.setdefault((post.user_id, post.climbed_on), []).append(post)

    covers = SessionCover.query.filter(
        db.or_(*[
            db.and_(SessionCover.user_id == user_id, SessionCover.session_date == climbed_on)
            for user_id, climbed_on in groups
        ])
    ).all()
    cover_post_ids = {(c.user_id, c.session_date): c.post_id for c in covers}

    users = {u.id: u for u in User.query.filter(User.id.in_({g[0] for g in groups})).all()}
    return [
        session_payload(
            users[user_id], climbed_on, by_group[(user_id, climbed_on)],
            cover_post_ids.get((user_id, climbed_on)),
        )
        for user_id, climbed_on in groups
    ]


def _paged_groups(query, limit, offset):
    last_climb = db.func.max(Post.climbed_at)
    rows = (
        query
        .with_entities(Post.user_id, Post.climbed_on, last_climb)
        .group_by(Post.user_id, Post.climbed_on)
        .order_by(Post.climbed_on.desc(), last_climb.desc(), Post.user_id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return [(row[0], row[1]) for row in rows]


def _paging_args():
    try:
        limit = min(int(request.args.get('limit', 20)), SESSIONS_MAX_LIMIT)
        offset = max(int(request.args.get('offset', 0)), 0)
    except ValueError:
        return None
    return limit, offset


def _parse_date(raw):
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


@sessions_bp.route('/api/sessions', methods=['GET'])
@login_required
def list_feed_sessions():
    paging = _paging_args()
    if paging is None:
        return {'error': 'limit/offset must be integers'}, 400
    limit, offset = paging

    feed = request.args.get('feed', 'all')
    if feed not in ('all', 'following'):
        return {'error': 'invalid feed'}, 400

    query = Post.query
    if feed == 'following':
        followed_ids = db.session.query(Follow.followed_id).filter(Follow.follower_id == current_user.id)
        query = query.filter(db.or_(Post.user_id.in_(followed_ids), Post.user_id == current_user.id))

    sessions = _sessions_for_groups(_paged_groups(query, limit, offset))
    return {
        'sessions': sessions,
        'next_offset': offset + len(sessions) if len(sessions) == limit else None,
    }


@sessions_bp.route('/api/users/<username>/sessions', methods=['GET'])
@login_required
def list_user_sessions(username):
    user = User.query.filter_by(username=username).first()
    if user is None:
        return {'error': 'user not found'}, 404

    paging = _paging_args()
    if paging is None:
        return {'error': 'limit/offset must be integers'}, 400
    limit, offset = paging

    sessions = _sessions_for_groups(
        _paged_groups(Post.query.filter_by(user_id=user.id), limit, offset)
    )
    total = (
        db.session.query(Post.climbed_on)
        .filter(Post.user_id == user.id)
        .distinct()
        .count()
    )
    return {
        'sessions': sessions,
        'total': total,
        'next_offset': offset + len(sessions) if len(sessions) == limit else None,
    }


@sessions_bp.route('/api/users/<username>/sessions/<session_date>', methods=['GET'])
@login_required
def get_user_session(username, session_date):
    user = User.query.filter_by(username=username).first()
    if user is None:
        return {'error': 'user not found'}, 404
    day = _parse_date(session_date)
    if day is None:
        return {'error': 'date must be YYYY-MM-DD'}, 400

    posts = (
        Post.query
        .filter_by(user_id=user.id, climbed_on=day)
        .order_by(Post.climbed_at.asc(), Post.id.asc())
        .all()
    )
    if not posts:
        return {'error': 'session not found'}, 404

    cover = db.session.get(SessionCover, (user.id, day))
    payload = session_payload(user, day, posts, cover.post_id if cover else None)
    payload['posts'] = [post_payload(p) for p in posts]
    return payload


@sessions_bp.route('/api/users/me/sessions/<session_date>/cover', methods=['PUT'])
@login_required
def set_session_cover(session_date):
    day = _parse_date(session_date)
    if day is None:
        return {'error': 'date must be YYYY-MM-DD'}, 400

    data = request.get_json(silent=True) or {}
    post_id = data.get('post_id')
    cover = db.session.get(SessionCover, (current_user.id, day))

    if post_id is None:
        if cover is not None:
            db.session.delete(cover)
            db.session.commit()
        return '', 204

    if not isinstance(post_id, int) or isinstance(post_id, bool):
        return {'error': 'post_id must be an integer or null'}, 400
    post = db.session.get(Post, post_id)
    if post is None or post.user_id != current_user.id or post.climbed_on != day:
        return {'error': 'post is not part of this session'}, 400

    if cover is None:
        db.session.add(SessionCover(user_id=current_user.id, session_date=day, post_id=post_id))
    else:
        cover.post_id = post_id
    db.session.commit()
    return '', 204
