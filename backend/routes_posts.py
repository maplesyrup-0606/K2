import os
import re
import uuid
from datetime import datetime, timezone

from flask import Blueprint, request
from flask_login import current_user, login_required
from PIL import Image, ImageOps, UnidentifiedImageError

import app
from extensions import db
from models import Post, Project, Gym, Reaction, Notification, Follow
from helpers import (
    GRADE_RANGES,
    VALID_OUTCOMES,
    VALID_ATTEMPTS,
    ALLOWED_MIMES,
    to_utc,
    post_payload,
    sync_project_status,
    prune_notifications,
)

posts_bp = Blueprint('posts', __name__)


@posts_bp.route('/api/posts', methods=['POST'])
@login_required
def create_post():
    form = request.form

    grade_scale = form.get('grade_scale')
    if grade_scale not in GRADE_RANGES:
        return {'error': 'grade_scale must be "v" or "comp"'}, 400

    try:
        grade_value = int(form.get('grade_value', ''))
    except ValueError:
        return {'error': 'grade_value must be an integer'}, 400
    lo, hi = GRADE_RANGES[grade_scale]
    if not (lo <= grade_value <= hi):
        return {'error': f'grade_value out of range for {grade_scale}'}, 400

    outcome = form.get('outcome')
    if outcome not in VALID_OUTCOMES:
        return {'error': 'invalid outcome'}, 400

    attempts_bucket = form.get('attempts_bucket')
    if attempts_bucket not in VALID_ATTEMPTS:
        return {'error': 'invalid attempts_bucket'}, 400

    notes = form.get('notes')
    if notes and len(notes) > 2000:
        return {'error': 'notes must be at most 2000 characters'}, 400

    hold_color = form.get('hold_color')
    if not hold_color or not re.match(r'^#[0-9a-fA-F]{6}$', hold_color):
        return {'error': 'hold_color is required and must be a valid hex color (#RRGGBB)'}, 400

    project = None
    project_id_str = form.get('project_id')
    if project_id_str:
        try:
            project_id = int(project_id_str)
        except ValueError:
            return {'error': 'project_id must be an integer'}, 400
        project = db.session.get(Project, project_id)
        if project is None or project.user_id != current_user.id:
            return {'error': 'project not found'}, 400

    gym_id_str = form.get('gym_id')
    if not gym_id_str:
        return {'error': 'gym_id is required'}, 400
    try:
        gym_id = int(gym_id_str)
    except ValueError:
        return {'error': 'gym_id must be an integer'}, 400
    if db.session.get(Gym, gym_id) is None:
        return {'error': 'gym not found'}, 400

    climbed_at_str = form.get('climbed_at')
    if climbed_at_str:
        try:
            climbed_at = to_utc(datetime.fromisoformat(climbed_at_str))
        except ValueError:
            return {'error': 'climbed_at must be ISO 8601'}, 400
    else:
        climbed_at = datetime.now(timezone.utc)

    photo = request.files.get('photo')
    if photo is None or photo.filename == '':
        return {'error': 'photo is required'}, 400

    if photo.mimetype not in ALLOWED_MIMES:
        return {'error' : 'photo must be jpeg, png, or webp'}, 400

    try:
        with Image.open(photo.stream) as img:
            img.verify()
    except (UnidentifiedImageError, OSError):
        return {'error': 'photo is not a valid image'}, 400

    photo.stream.seek(0)

    filename = f"{uuid.uuid4().hex}.jpg"
    user_dir = os.path.join(app.MEDIA_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    photo_path_disk = os.path.join(user_dir, filename)
    photo_path_rel = f"{current_user.id}/{filename}"

    with Image.open(photo.stream) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert('RGB')
        img.thumbnail((1200, 1200), Image.LANCZOS)
        img.save(photo_path_disk, format='JPEG', quality=85, optimize=True)

    post = Post(
        user_id=current_user.id,
        climbed_at=climbed_at,
        grade_scale=grade_scale,
        grade_value=grade_value,
        outcome=outcome,
        attempts_bucket=attempts_bucket,
        photo_path=photo_path_rel,
        notes=notes,
        hold_color=hold_color,
        project_id=project.id if project else None,
        gym_id=gym_id,
    )

    db.session.add(post)
    sync_project_status(project, outcome)
    db.session.commit()

    return post_payload(post), 201

@posts_bp.route('/api/posts', methods=['GET'])
@login_required
def list_posts():
    try:
        limit = min(int(request.args.get('limit', 20)), 50)
        offset = max(int(request.args.get('offset', 0)), 0)

    except ValueError:
        return {'error': 'limit/offset must be integers'}, 400

    feed = request.args.get('feed', 'all')
    if feed not in ('all', 'following'):
        return {'error': 'invalid feed'}, 400

    query = Post.query
    if feed == 'following':
        followed_ids = db.session.query(Follow.followed_id).filter(Follow.follower_id == current_user.id)
        query = query.filter(db.or_(Post.user_id.in_(followed_ids), Post.user_id == current_user.id))

    posts = (
        query
        .order_by(Post.climbed_at.desc(), Post.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return {
        'posts': [post_payload(p) for p in posts],
        'next_offset': offset + len(posts) if len(posts) == limit else None,
    }

@posts_bp.route('/api/posts/<int:post_id>', methods=['DELETE'])
@login_required
def delete_post(post_id):
    post = db.session.get(Post, post_id)

    if post is None:
        return {'error' : 'post not found'}, 404

    if post.user_id != current_user.id:
        return {'error' : 'not your post'}, 403

    photo_disk_path = os.path.join(app.MEDIA_DIR, post.photo_path)
    try:
        os.remove(photo_disk_path)
    except OSError:
        pass

    db.session.delete(post)
    db.session.commit()

    return '', 204

@posts_bp.route('/api/posts/<int:post_id>', methods=['GET'])
@login_required
def get_post(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return {'error' : 'post not found'}, 404

    return post_payload(post)

@posts_bp.route('/api/posts/<int:post_id>', methods=['PATCH'])
@login_required
def update_post(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return {'error': 'post not found'}, 404
    if post.user_id != current_user.id:
        return {'error': 'not your post'}, 403

    data = request.get_json(silent=True) or {}

    new_scale = data['grade_scale'] if 'grade_scale' in data else post.grade_scale
    new_value = data['grade_value'] if 'grade_value' in data else post.grade_value

    if new_scale not in GRADE_RANGES:
        return {'error': 'grade_scale must be "v" or "comp"'}, 400

    try:
        new_value = int(new_value)
    except (ValueError, TypeError):
        return {'error': 'grade_value must be an integer'}, 400
    lo, hi = GRADE_RANGES[new_scale]
    if not (lo <= new_value <= hi):
        return {'error': f'grade_value out of range for {new_scale}'}, 400

    post.grade_scale = new_scale
    post.grade_value = new_value

    if 'outcome' in data:
        if data['outcome'] not in VALID_OUTCOMES:
            return {'error': 'invalid outcome'}, 400
        post.outcome = data['outcome']

    if 'attempts_bucket' in data:
        if data['attempts_bucket'] not in VALID_ATTEMPTS:
            return {'error': 'invalid attempts_bucket'}, 400
        post.attempts_bucket = data['attempts_bucket']

    if 'notes' in data:
        notes = data['notes']
        if notes is not None and len(notes) > 2000:
            return {'error': 'notes must be at most 2000 characters'}, 400
        post.notes = notes  # may be None to clear

    if 'project_id' in data:
        if data['project_id'] is None:
            post.project_id = None
        else:
            try:
                pid = int(data['project_id'])
            except (ValueError, TypeError):
                return {'error': 'project_id must be an integer'}, 400
            project = db.session.get(Project, pid)
            if project is None or project.user_id != current_user.id:
                return {'error': 'project not found'}, 400
            post.project_id = pid

    if 'gym_id' in data:
        if data['gym_id'] is None:
            post.gym_id = None
        else:
            try:
                gid = int(data['gym_id'])
            except (ValueError, TypeError):
                return {'error': 'gym_id must be an integer'}, 400
            if db.session.get(Gym, gid) is None:
                return {'error': 'gym not found'}, 400
            post.gym_id = gid

    if 'hold_color' in data:
        hc = data['hold_color']
        if hc is not None and not re.match(r'^#[0-9a-fA-F]{6}$', hc):
            return {'error': 'hold_color must be a valid hex color (#RRGGBB)'}, 400
        post.hold_color = hc

    if post.project_id is not None:
        sync_project_status(db.session.get(Project, post.project_id), post.outcome)

    db.session.commit()
    return post_payload(post)

@posts_bp.route('/api/posts/<int:post_id>/reactions', methods=['POST'])
@login_required
def add_reaction(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return {'error' : 'post not found'}, 404

    data = request.get_json(silent=True) or {}
    emoji = data.get('emoji')
    if not isinstance(emoji, str) or not (1 <= len(emoji) <= 16):
        return {'error': 'emoji must be a string 1–16 chars'}, 400

    existing = db.session.get(Reaction, (post_id, current_user.id, emoji))
    if existing is None:
        db.session.add(Reaction(
            post_id=post_id,
            user_id=current_user.id,
            emoji=emoji,
        ))

        if post.user_id != current_user.id:
            db.session.add(Notification(
                user_id=post.user_id,
                actor_id=current_user.id,
                type='reaction',
                post_id=post_id,
                emoji=emoji,
            ))
        db.session.commit()
        if post.user_id != current_user.id:
            prune_notifications(post.user_id)

    return post_payload(post), 200


@posts_bp.route('/api/posts/<int:post_id>/reactions/<emoji>', methods=['DELETE'])
@login_required
def remove_reaction(post_id, emoji):
    post = db.session.get(Post, post_id)
    if post is None:
        return {'error' : 'post not found'}, 404

    reaction = db.session.get(Reaction, (post_id, current_user.id, emoji))
    if reaction is not None:
        db.session.delete(reaction)
        db.session.commit()

    return post_payload(post), 200
