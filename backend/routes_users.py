import os
import re
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher

from flask import Blueprint, request
from flask_login import current_user, login_required
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func

import app
from extensions import db
from models import User, Post, Project, Follow, Notification, SocialLink
from helpers import (
    ALLOWED_MIMES,
    PROJECT_LIFETIME_DAYS,
    iso_utc,
    user_payload,
    post_payload,
    project_payload,
    _instagram_handle,
    _follow_state,
    _fuzzy_subsequence,
    normalize_instagram_handle,
    prune_notifications,
)

users_bp = Blueprint('users', __name__)

USERNAME_RE = re.compile(r'^[a-z0-9_]{3,30}$')
BIO_MAX_LEN = 160
INSTAGRAM_HANDLE_RE = re.compile(r'^[a-zA-Z0-9_.]{1,30}$')


@users_bp.route('/api/users/me', methods=['PATCH'])
@login_required
def update_me():
    data = request.get_json(silent=True) or {}

    if 'display_name' in data:
        display_name = (data['display_name'] or '').strip()
        if not (1 <= len(display_name) <= 120):
            return {'error': 'display_name must be 1-120 characters'}, 400
        current_user.display_name = display_name
        if not current_user.is_onboarded:
            current_user.is_onboarded = True
        current_user.profile_customized = True

    if 'username' in data:
        username = (data['username'] or '').strip().lower()
        if not USERNAME_RE.match(username):
            return {'error': 'username must be 3-30 characters: lowercase letters, numbers, underscores only'}, 400
        if username != current_user.username:
            if User.query.filter_by(username=username).first():
                return {'error': 'username is already taken'}, 409
            current_user.username = username
        current_user.profile_customized = True

    if 'bio' in data:
        bio = data['bio']
        if bio is not None:
            bio = bio.strip()
            if len(bio) > BIO_MAX_LEN:
                return {'error': f'bio must be at most {BIO_MAX_LEN} characters'}, 400
            if bio == '':
                bio = None
        current_user.bio = bio

    if 'instagram_handle' in data:
        raw = data['instagram_handle']
        handle = normalize_instagram_handle(raw) if raw else ''
        existing_link = db.session.get(SocialLink, (current_user.id, 'instagram'))
        if not handle:
            if existing_link is not None:
                db.session.delete(existing_link)
        else:
            if not INSTAGRAM_HANDLE_RE.match(handle):
                return {'error': 'instagram_handle must be 1-30 letters, numbers, periods, or underscores'}, 400
            if existing_link is None:
                db.session.add(SocialLink(user_id=current_user.id, platform='instagram', handle=handle))
            else:
                existing_link.handle = handle

    db.session.commit()
    return user_payload(current_user)


@users_bp.route('/api/users/me/avatar', methods=['POST'])
@login_required
def update_avatar():
    photo = request.files.get('photo')
    if photo is None or photo.filename == '':
        return {'error': 'photo is required'}, 400

    if photo.mimetype not in ALLOWED_MIMES:
        return {'error': 'photo must be jpeg, png, or webp'}, 400

    try:
        with Image.open(photo.stream) as img:
            img.verify()
    except (UnidentifiedImageError, OSError):
        return {'error': 'photo is not a valid image'}, 400

    photo.stream.seek(0)

    user_dir = os.path.join(app.MEDIA_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    avatar_disk = os.path.join(user_dir, 'avatar.jpg')

    with Image.open(photo.stream) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert('RGB')
        img.thumbnail((400, 400), Image.LANCZOS)
        img.save(avatar_disk, format='JPEG', quality=85, optimize=True)

    current_user.avatar_url = f"/media/{current_user.id}/avatar.jpg"
    current_user.profile_customized = True
    db.session.commit()
    return user_payload(current_user)


@users_bp.route('/api/users/<username>', methods=['GET'])
@login_required
def get_user(username):
    user = User.query.filter_by(username=username).first()

    if user is None:
        return {'error': 'user not found'}, 404

    return {
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url,
        'bio': user.bio,
        'instagram_handle': _instagram_handle(user),
        'created_at': iso_utc(user.created_at),
        **_follow_state(user),
    }


@users_bp.route('/api/users/<username>/follow', methods=['POST'])
@login_required
def follow_user(username):
    user = User.query.filter_by(username=username).first()
    if user is None:
        return {'error': 'user not found'}, 404
    if user.id == current_user.id:
        return {'error': 'cannot follow yourself'}, 400
    if db.session.get(Follow, (current_user.id, user.id)) is None:
        db.session.add(Follow(follower_id=current_user.id, followed_id=user.id))
        db.session.add(Notification(
            user_id=user.id,
            actor_id=current_user.id,
            type='follow',
        ))
        db.session.commit()
        prune_notifications(user.id)
    return _follow_state(user)


@users_bp.route('/api/users/me/following', methods=['GET'])
@login_required
def list_following():
    followees = (
        db.session.query(User)
        .join(Follow, Follow.followed_id == User.id)
        .filter(Follow.follower_id == current_user.id)
        .order_by(User.display_name.asc())
        .all()
    )
    return {
        'users': [
            {
                'id': u.id,
                'username': u.username,
                'display_name': u.display_name,
                'avatar_url': u.avatar_url,
            }
            for u in followees
        ]
    }


@users_bp.route('/api/users/<username>/follow', methods=['DELETE'])
@login_required
def unfollow_user(username):
    user = User.query.filter_by(username=username).first()
    if user is None:
        return {'error': 'user not found'}, 404
    existing = db.session.get(Follow, (current_user.id, user.id))
    if existing is not None:
        db.session.delete(existing)
        db.session.commit()
    return _follow_state(user)


@users_bp.route('/api/users', methods=['GET'])
@login_required
def search_users():
    q = request.args.get('q', '').strip().lower()
    if not q:
        return {'users': []}

    def score(user):
        best = 0.0
        for field in (user.username, user.display_name):
            text = (field or '').lower()
            if not text or not _fuzzy_subsequence(q, text):
                continue
            s = SequenceMatcher(None, q, text).ratio()
            # Prefix and substring hits rank above scattered subsequences
            if text.startswith(q):
                s += 1.0
            elif q in text:
                s += 0.5
            best = max(best, s)
        return best

    # User base is small (invite-only), so scoring in Python is fine
    candidates = User.query.filter_by(is_onboarded=True).all()
    scored = [(score(u), u) for u in candidates]
    matches = sorted(
        (item for item in scored if item[0] > 0),
        key=lambda item: item[0],
        reverse=True,
    )[:20]
    return {'users': [{
        'id': u.id,
        'username': u.username,
        'display_name': u.display_name,
        'avatar_url': u.avatar_url,
    } for _, u in matches]}

@users_bp.route('/api/users/<username>/posts', methods=['GET'])
@login_required
def list_user_posts(username):
    user = User.query.filter_by(username=username).first()

    if user is None:
        return {'error': 'user not found'}, 404

    try:
        limit = min(int(request.args.get('limit', 20)), 50)
        offset = max(int(request.args.get('offset', 0)), 0)

    except ValueError:
        return {'error': 'limit/offset must be integers'}, 400


    posts = (
        Post.query
        .filter_by(user_id=user.id)
        .order_by(Post.climbed_at.desc(), Post.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return {
        'posts': [post_payload(p) for p in posts],
        'next_offset': offset + len(posts) if len(posts) == limit else None,
    }

WINDOW_DAYS = {'30d':30,'90d':90,'1y':365}
@users_bp.route('/api/users/<username>/stats', methods=['GET'])
@login_required
def get_user_stats(username):
    user = User.query.filter_by(username=username).first()
    if user is None:
        return {'error' : 'user not found'}, 404

    window = request.args.get('window', '30d')
    if window != 'all' and window not in WINDOW_DAYS:
        return {'error': 'window must be one of: 30d, 90d, 1y, all'}, 400

    cutoff = None
    if window in WINDOW_DAYS:
        cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS[window])

    base = Post.query.filter_by(user_id=user.id)
    if cutoff is not None:
        base = base.filter(Post.climbed_at >= cutoff)

    sessions = (
        base.with_entities(func.count(func.distinct(func.date(Post.climbed_at))))
        .scalar()
        or 0
    )

    sends = base.filter(Post.outcome == 'sent')
    total_sends = sends.count()

    flash_count = sends.filter(Post.attempts_bucket == '1').count()

    v_rows = (
        sends.filter(Post.grade_scale == 'v')
        .with_entities(Post.grade_value, func.count())
        .group_by(Post.grade_value)
        .all()
    )
    v_pyramid = {gv : count for gv, count in v_rows}

    comp_rows = (
        sends.filter(Post.grade_scale == 'comp')
        .with_entities(Post.grade_value, func.count())
        .group_by(Post.grade_value)
        .all()
    )
    comp_pyramid = {gv : count for gv, count in comp_rows}

    hardest_v = max(v_pyramid.keys(), default=None)
    hardest_comp = max(comp_pyramid.keys(), default=None)

    return {
        'window': window,
        'sessions': sessions,
        'total_sends': total_sends,
        'flash_count': flash_count,
        'hardest_v': hardest_v,
        'hardest_comp': hardest_comp,
        'v_pyramid': v_pyramid,
        'comp_pyramid': comp_pyramid,
    }

@users_bp.route('/api/users/<username>/projects', methods=['GET'])
@login_required
def list_user_projects(username):
    user = User.query.filter_by(username=username).first()
    if user is None:
        return {'error': 'user not found'}, 404

    status = request.args.get('status')
    if status and status not in {'active', 'sent', 'abandoned'}:
        return {'error': 'invalid status'}, 400

    q = Project.query.filter_by(user_id=user.id)
    if status:
        q = q.filter_by(status=status)
        if status == 'active':
            # An "active" project past the 30-day lifetime is effectively gone
            cutoff = datetime.now(timezone.utc) - timedelta(days=PROJECT_LIFETIME_DAYS)
            q = q.filter(Project.created_at > cutoff)

    projects = q.order_by(Project.created_at.desc()).all()
    return {'projects': [project_payload(p) for p in projects]}
