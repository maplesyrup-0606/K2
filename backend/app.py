from dotenv import load_dotenv
from flask import Flask, url_for, redirect, abort, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager, current_user, login_user, login_required, logout_user
from flask_cors import CORS
from sqlalchemy import func
from authlib.integrations.flask_client import OAuth
from datetime import datetime, timezone, timedelta
from PIL import Image, UnidentifiedImageError
from functools import wraps

import os, re, secrets, uuid

load_dotenv()
app = Flask(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

CORS(
    app,
    resources={r"/api/*": {"origins": "http://localhost:5173"}},
    supports_credentials=True,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config['SECRET_KEY'] = os.getenv("FLASK_SECRET_KEY")
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, 'app.db')}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # set True in production (HTTPS only)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 # 10MB

MEDIA_DIR = os.path.join(BASE_DIR, 'media')
os.makedirs(MEDIA_DIR, exist_ok=True)

db = SQLAlchemy(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
from models import User, InviteAllowList, Project, Post, Reaction

oauth = OAuth(app)
oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
            'scope':'openid email profile'
    }
)

@app.route('/api/health', methods=['GET'])
def get_health():
    return {'ok': True}


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return {'error':'unauthenticated'}, 401
        if not current_user.is_admin:
            return {'error': 'admin only'}, 403
        
        return f(*args, **kwargs)
    return decorated

@app.route('/api/admin/invites', methods=['GET'])
@admin_required
def list_invites():
    invites = InviteAllowList.query.order_by(InviteAllowList.created_at.desc()).all()
    return {
        'invites': [
            {
                'email': inv.email,
                'invited_by': inv.invited_by,
                'created_at': inv.created_at.isoformat()
            }
            for inv in invites
        ]
    }

@app.route('/api/admin/invites', methods=['POST'])
@admin_required
def add_invite():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email or len(email) > 255:
        return {'error': 'valid email required'}, 400

    existing = db.session.get(InviteAllowList, email)
    if existing is None:
        db.session.add(InviteAllowList(
            email=email,
            invited_by=current_user.id,
        ))
        db.session.commit()

    return {
        'email': email,
        'invited_by': current_user.id,
        'created_at': (existing.created_at if existing else InviteAllowList.query.get(email).created_at).isoformat()
    }, 201
    
@app.route('/api/admin/invites/<email>', methods=['DELETE'])
@admin_required
def remove_invite(email):
    inv = db.session.get(InviteAllowList, email)
    if inv is not None:
        db.session.delete(inv)
        db.session.commit()
    
    return '', 204
    
@app.route('/api/auth/google/login')
def google_login():
    redirect_uri = url_for('google_callback', _external=True)
    return oauth.google.authorize_redirect(redirect_uri)

def generate_unique_username():
    while True:
        candidate = f"user_{secrets.token_hex(4)}"
        if User.query.filter_by(username=candidate).first() is None:
            return candidate


@app.route('/api/auth/google/callback')
def google_callback():
    token = oauth.google.authorize_access_token()
    user_info = token.get('userinfo')

    sub = user_info['sub']
    email = user_info['email']

    user = User.query.filter_by(google_sub=sub).first()

    if user is None:
        if db.session.get(InviteAllowList, email) is None:
            abort(403, description='Email not on invite list')

        user = User(
            google_sub=sub,
            email=email,
            username=generate_unique_username(),
            display_name=user_info.get('name') or email.split('@')[0],
            avatar_url=user_info.get('picture'),
        )

        db.session.add(user)
        db.session.commit()

    login_user(user)
    return redirect(FRONTEND_URL)

def user_payload(user):
    return {
        'id': user.id,
        'email': user.email,
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url,
        'is_onboarded': user.is_onboarded,
        'is_admin': user.is_admin,
    }

def post_payload(post):
    rows = (
        db.session.query(Reaction.emoji, func.count())
        .filter(Reaction.post_id == post.id)
        .group_by(Reaction.emoji)
        .all()
    )
    
    reaction_counts = {emoji: count for emoji, count in rows}
    my_reactions = [
        r.emoji for r in
        Reaction.query.filter_by(post_id=post.id, user_id=current_user.id).all()
    ]
    return {
        'id': post.id,
        'user_id': post.user_id,
        'created_at': post.created_at.isoformat(),
        'climbed_at': post.climbed_at.isoformat(),
        'grade_scale': post.grade_scale,
        'grade_value': post.grade_value,
        'outcome': post.outcome,
        'attempts_bucket': post.attempts_bucket,
        'photo_path': post.photo_path,
        'notes': post.notes,
        'project_id': post.project_id,
        'is_flash': post.outcome == 'sent' and post.attempts_bucket == '1',
        'user': {
            'id': post.user.id,
            'username': post.user.username,
            'display_name': post.user.display_name,
            'avatar_url': post.user.avatar_url,
        },
        'reaction_counts': reaction_counts,
        'my_reactions': my_reactions,
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

    # SQLite returns naive datetimes; we stored UTC, so promote to aware.
    created_at = project.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    expires_at = created_at + timedelta(days=PROJECT_LIFETIME_DAYS)
    is_expired = datetime.now(timezone.utc) > expires_at

    payload = {
        'id': project.id,
        'user_id': project.user_id,
        'title': project.title,
        'photo_path': project.photo_path,
        'grade_scale': project.grade_scale,
        'grade_value': project.grade_value,
        'status': project.status,
        'created_at': project.created_at.isoformat(),
        'closed_at': project.closed_at.isoformat() if project.closed_at else None,
        'expires_at': expires_at.isoformat(),
        'is_expired': is_expired,
        'sessions': sessions_count,
        'attempts_lower_bound': attempts_lower,
    }
    if include_posts:
        payload['posts'] = [post_payload(p) for p in posts]
    return payload


@app.route('/api/auth/me')
def auth_me():
    if not current_user.is_authenticated:
        return {'user': None}, 401
    return user_payload(current_user)


@app.route('/api/users/me', methods=['PATCH'])
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

    db.session.commit()
    return user_payload(current_user)

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return {'ok' : True}


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

VALID_OUTCOMES = {'sent', 'projecting', 'gave_up'}
VALID_ATTEMPTS = {'1', '2', '3-4', '5-9', '10+'}
GRADE_RANGES = {'v': (0, 9), 'comp': (1, 4)}
ALLOWED_MIMES = {
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
}

@app.route('/api/posts', methods=['POST'])
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

    climbed_at_str = form.get('climbed_at')
    if climbed_at_str:
        try:
            climbed_at = datetime.fromisoformat(climbed_at_str)
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
    
    ext = ALLOWED_MIMES[photo.mimetype]
    filename = f"{uuid.uuid4().hex}{ext}"
    
    user_dir = os.path.join(MEDIA_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    
    photo_path_disk = os.path.join(user_dir, filename)
    photo_path_rel = f"{current_user.id}/{filename}"
    
    photo.save(photo_path_disk)
    
    post = Post(
        user_id=current_user.id,
        climbed_at=climbed_at,
        grade_scale=grade_scale,
        grade_value=grade_value,
        outcome=outcome,
        attempts_bucket=attempts_bucket,
        photo_path=photo_path_rel,
        notes=notes,
        project_id=project.id if project else None,
    )
    
    db.session.add(post)
    db.session.commit()

    return post_payload(post), 201

@app.route('/api/posts', methods=['GET'])
@login_required
def list_posts():
    try:
        limit = min(int(request.args.get('limit', 20)), 50)
        offset = max(int(request.args.get('offset', 0)), 0)
    
    except ValueError:
        return {'error': 'limit/offset must be integers'}, 400

    posts = (
        Post.query
        .order_by(Post.climbed_at.desc(), Post.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    
    return {
        'posts': [post_payload(p) for p in posts],
        'next_offset': offset + len(posts) if len(posts) == limit else None,
    }

@app.route('/api/posts/<int:post_id>', methods=['DELETE'])
@login_required
def delete_post(post_id):
    post = db.session.get(Post, post_id)
    
    if post is None:
        return {'error' : 'post not found'}, 404

    if post.user_id != current_user.id:
        return {'error' : 'not your post'}, 403
    
    photo_disk_path = os.path.join(MEDIA_DIR, post.photo_path)
    try:
        os.remove(photo_disk_path)
    except OSError:
        pass

    db.session.delete(post)
    db.session.commit()
    
    return '', 204

@app.route('/api/users/<username>', methods=['GET'])
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
        'created_at': user.created_at.isoformat()
    }
    
@app.route('/api/users/<username>/posts', methods=['GET'])
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

@app.route('/api/posts/<int:post_id>', methods=['PATCH'])
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

    db.session.commit()
    return post_payload(post)

@app.route('/api/posts/<int:post_id>/reactions', methods=['POST'])
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
        db.session.commit()
    
    return post_payload(post), 200


@app.route('/api/posts/<int:post_id>/reactions/<emoji>', methods=['DELETE'])
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

WINDOW_DAYS = {'30d':30,'90d':90,'1y':365}
@app.route('/api/users/<username>/stats', methods=['GET'])
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
    
@app.route('/api/users/<username>/projects', methods=['GET'])
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

@app.route('/api/projects/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    project = db.session.get(Project, project_id)
    if project is None:
        return {'error':'project not found'}, 404
    return project_payload(project, include_posts=True)

@app.route('/api/projects', methods=['POST'])
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

    ext = ALLOWED_MIMES[photo.mimetype]
    filename = f"{uuid.uuid4().hex}{ext}"
    user_dir = os.path.join(MEDIA_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    photo.save(os.path.join(user_dir, filename))
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

@app.route('/api/projects/<int:project_id>', methods=['PATCH'])
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

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project(project_id):
    project = db.session.get(Project, project_id)
    if project is None:
        return {'error': 'project not found'}, 404
    if project.user_id != current_user.id:
        return {'error': 'not your project'}, 403
    
    Post.query.filter_by(project_id=project_id).update({'project_id':None})
    
    photo_disk = os.path.join(MEDIA_DIR, project.photo_path)
    try:
        os.remove(photo_disk)
    except OSError:
        pass

    db.session.delete(project)
    db.session.commit()
    return '', 204


@app.route("/media/<path:filepath>")    
def serve_media(filepath):
    return send_from_directory(MEDIA_DIR, filepath)


if __name__ == '__main__':
    app.run(debug=True, port=5000)
