import os
import uuid
from datetime import datetime, timezone

from flask import Blueprint, request
from flask_login import current_user, login_required
from PIL import Image, ImageOps, UnidentifiedImageError

import app
from extensions import db
from models import Project, Post
from helpers import GRADE_RANGES, ALLOWED_MIMES, project_payload

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('/api/projects/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    project = db.session.get(Project, project_id)
    if project is None:
        return {'error':'project not found'}, 404
    return project_payload(project, include_posts=True)

@projects_bp.route('/api/projects', methods=['POST'])
@login_required
def create_project():
    form = request.form

    title = (form.get('title') or '').strip()
    if not (1 <= len(title) <= 120):
        return {'error': 'title must be 1-120 chars'}, 400

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

    filename = f"{uuid.uuid4().hex}.jpg"
    user_dir = os.path.join(app.MEDIA_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    with Image.open(photo.stream) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert('RGB')
        img.thumbnail((1200, 1200), Image.LANCZOS)
        img.save(os.path.join(user_dir, filename), format='JPEG', quality=85, optimize=True)

    photo_path_rel = f"{current_user.id}/{filename}"

    project = Project(
        user_id=current_user.id,
        title=title,
        photo_path=photo_path_rel,
        grade_scale=grade_scale,
        grade_value=grade_value,
        status='active',
    )
    db.session.add(project)
    db.session.commit()
    return project_payload(project), 201

@projects_bp.route('/api/projects/<int:project_id>', methods=['PATCH'])
@login_required
def update_project(project_id):
    project = db.session.get(Project, project_id)
    if project is None:
        return {'error': 'project not found'}, 404
    if project.user_id != current_user.id:
        return {'error': 'not your project'}, 403

    data = request.get_json(silent=True) or {}

    if 'title' in data:
        title = (data['title'] or '').strip()
        if not (1 <= len(title) <= 120):
            return {'error': 'title must be 1-120 chars'}, 400
        project.title = title

    if 'status' in data:
        if data['status'] not in {'active', 'sent', 'abandoned'}:
            return {'error': 'invalid status'}, 400

        old = project.status
        project.status = data['status']

        if old == 'active' and project.status != 'active':
            project.closed_at = datetime.now(timezone.utc)

        elif old != 'active' and project.status == 'active':
            project.closed_at = None

    db.session.commit()
    return project_payload(project)

@projects_bp.route('/api/projects/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project(project_id):
    project = db.session.get(Project, project_id)
    if project is None:
        return {'error': 'project not found'}, 404
    if project.user_id != current_user.id:
        return {'error': 'not your project'}, 403

    Post.query.filter_by(project_id=project_id).update({'project_id':None})

    photo_disk = os.path.join(app.MEDIA_DIR, project.photo_path)
    try:
        os.remove(photo_disk)
    except OSError:
        pass

    db.session.delete(project)
    db.session.commit()
    return '', 204
