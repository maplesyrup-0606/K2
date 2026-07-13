from dotenv import load_dotenv
from flask import Flask, url_for, redirect, abort, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager, current_user, login_user, login_required, logout_user
from flask_cors import CORS
from sqlalchemy import func, or_, update as sql_update
from authlib.integrations.flask_client import OAuth
from datetime import datetime, timezone, timedelta, date
from PIL import Image, ImageOps, UnidentifiedImageError
from functools import wraps
import os, re, secrets, uuid, smtplib
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo

VANCOUVER_TZ = ZoneInfo('America/Vancouver')
from email.mime.text import MIMEText


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


load_dotenv()
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

CORS(
    app,
    resources={r"/api/*": {"origins": FRONTEND_URL}},
    supports_credentials=True,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config['SECRET_KEY'] = os.getenv("FLASK_SECRET_KEY")
# K2_DATABASE_URI must be honored here: Flask-SQLAlchemy 3.x creates the
# engine at SQLAlchemy(app) time, so config changes after import are ignored.
# Tests rely on this env var to avoid touching the real app.db.
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'K2_DATABASE_URI', f'sqlite:///{os.path.join(BASE_DIR, 'app.db')}'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True
# The remember_token cookie is separate from the session cookie and has
# weaker Flask-Login defaults (SECURE=False, SAMESITE=None) — harden it too.
app.config['REMEMBER_COOKIE_SAMESITE'] = 'Lax'
app.config['REMEMBER_COOKIE_HTTPONLY'] = True
app.config['REMEMBER_COOKIE_SECURE'] = True
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 # 10MB

MEDIA_DIR = os.path.join(BASE_DIR, 'media')
os.makedirs(MEDIA_DIR, exist_ok=True)

db = SQLAlchemy(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
from models import User, InviteAllowList, Project, Post, Reaction, Gym, Plan, PlanAttendee, Notification, Follow

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
                'created_at': iso_utc(inv.created_at)
            }
            for inv in invites
        ]
    }

GMAIL_FROM = os.getenv('GMAIL_FROM', 'mercurymcindoe@gmail.com')

def _send_email(to_email, subject, html):
    password = os.getenv('GMAIL_APP_PASSWORD')
    if not password:
        print('[email] skipped — GMAIL_APP_PASSWORD not set')
        return
    msg = MIMEText(html, 'html')
    msg['Subject'] = subject
    msg['From'] = f'K2 <{GMAIL_FROM}>'
    msg['To'] = to_email
    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(GMAIL_FROM, password)
            smtp.sendmail(GMAIL_FROM, to_email, msg.as_string())
        print(f'[email] "{subject}" sent to {to_email}')
    except Exception as e:
        print(f'[email] failed to send to {to_email}: {e}')


def send_invite_email(to_email):
    app_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0c0a09;color:#f5f5f4;border-radius:12px;">
      <h1 style="font-size:48px;font-weight:800;color:#863bff;margin:0 0 8px;">K2</h1>
      <p style="color:#a8a29e;margin:0 0 24px;">Climbing log for friends</p>
      <p style="margin:0 0 32px;">You've been invited. Tap below to install the app and get started.</p>
      <a href="{app_url}/install" style="display:inline-block;background:#863bff;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Get started →</a>
    </div>
    """
    _send_email(to_email, "You've been invited to K2", html)


def send_plan_notification_email(to_email, going_phrase, gym_name, time_str, plans_url, settings_url):
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0c0a09;color:#f5f5f4;border-radius:12px;">
      <h1 style="font-size:48px;font-weight:800;color:#863bff;margin:0 0 8px;">K2</h1>
      <p style="color:#a8a29e;margin:0 0 24px;">Climbing log for friends</p>
      <p style="margin:0 0 32px;">{going_phrase} <strong>{gym_name}</strong> at {time_str} today.</p>
      <a href="{plans_url}" style="display:inline-block;background:#863bff;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Join them →</a>
      <p style="margin:32px 0 0;font-size:12px;color:#78716c;">You're getting this because you're on K2. <a href="{settings_url}" style="color:#a78bfa;text-decoration:none;">Manage notification settings</a></p>
    </div>
    """
    _send_email(to_email, f"Climbing at {gym_name} today — want in?", html)


@app.route('/api/admin/invites', methods=['POST'])
@admin_required
def add_invite():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email or len(email) > 255:
        return {'error': 'valid email required'}, 400

    existing = db.session.get(InviteAllowList, email)
    if existing is not None:
        return {
            'email': existing.email,
            'invited_by': existing.invited_by,
            'created_at': iso_utc(existing.created_at),
        }, 200

    invite = InviteAllowList(email=email, invited_by=current_user.id)
    db.session.add(invite)
    db.session.commit()
    send_invite_email(email)
    return {
        'email': invite.email,
        'invited_by': invite.invited_by,
        'created_at': iso_utc(invite.created_at),
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
    redirect_uri = os.getenv('OAUTH_REDIRECT_URI', url_for('google_callback', _external=True))
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

    login_user(user, remember=True, duration=timedelta(days=90))
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
        'email_notifications_enabled': user.email_notifications_enabled,
        'profile_customized': user.profile_customized,
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


@app.route('/api/auth/me')
def auth_me():
    if not current_user.is_authenticated:
        return {'user': None}, 401
    return user_payload(current_user)


USERNAME_RE = re.compile(r'^[a-z0-9_]{3,30}$')

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

    if 'email_notifications_enabled' in data:
        val = data['email_notifications_enabled']
        if not isinstance(val, bool):
            return {'error': 'email_notifications_enabled must be a boolean'}, 400
        current_user.email_notifications_enabled = val

    db.session.commit()
    return user_payload(current_user)


@app.route('/api/users/me/avatar', methods=['POST'])
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

    user_dir = os.path.join(MEDIA_DIR, str(current_user.id))
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
    user_dir = os.path.join(MEDIA_DIR, str(current_user.id))
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

@app.route('/api/posts/<int:post_id>', methods=['GET'])
@login_required
def get_post(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return {'error' : 'post not found'}, 404

    return post_payload(post)

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
        'created_at': iso_utc(user.created_at),
        **_follow_state(user),
    }


def _follow_state(user):
    return {
        'follower_count': Follow.query.filter_by(followed_id=user.id).count(),
        'following_count': Follow.query.filter_by(follower_id=user.id).count(),
        'is_following': db.session.get(Follow, (current_user.id, user.id)) is not None,
    }


@app.route('/api/users/<username>/follow', methods=['POST'])
@login_required
def follow_user(username):
    user = User.query.filter_by(username=username).first()
    if user is None:
        return {'error': 'user not found'}, 404
    if user.id == current_user.id:
        return {'error': 'cannot follow yourself'}, 400
    if db.session.get(Follow, (current_user.id, user.id)) is None:
        db.session.add(Follow(follower_id=current_user.id, followed_id=user.id))
        db.session.commit()
    return _follow_state(user)


@app.route('/api/users/<username>/follow', methods=['DELETE'])
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


def _fuzzy_subsequence(q, text):
    """True if the chars of q appear in text in order (editor-style fuzzy find)."""
    pos = 0
    for ch in q:
        pos = text.find(ch, pos)
        if pos == -1:
            return False
        pos += 1
    return True


@app.route('/api/users', methods=['GET'])
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

    filename = f"{uuid.uuid4().hex}.jpg"
    user_dir = os.path.join(MEDIA_DIR, str(current_user.id))
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

def gym_payload(gym):
    return {
        'id': gym.id,
        'name': gym.name,
        'city': gym.city,
        'country': gym.country,
        'created_at': iso_utc(gym.created_at)
    }

@app.route('/api/admin/gyms', methods=['POST'])
@admin_required
def add_gym():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    
    if not (1 <= len(name) <= 120):
        return {'error': 'name must be 1-120 chars'}, 400

    city = (data.get('city') or '').strip() or None
    if city and len(city) > 120:
        return {'error': 'city must be 1-120 chars'}, 400

    country = (data.get('country') or '').strip() or None
    if country and len(country) > 120:
        return {'error': 'country must be 1-120 chars'}, 400

    existing = Gym.query.filter_by(name=name).first()
    if existing is not None:
        return gym_payload(existing), 200

    gym = Gym(name=name, city=city, country=country)
    db.session.add(gym)
    db.session.commit()
    return gym_payload(gym), 201

@app.route('/api/gyms', methods=['GET'])
@login_required
def list_gyms():
    gyms = Gym.query.order_by(Gym.name.asc()).all()
    return {'gyms': [gym_payload(g) for g in gyms]}

@app.route('/api/admin/gyms/<int:gym_id>', methods=['PATCH'])
@admin_required
def update_gym(gym_id):
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 404

    data = request.get_json(silent=True) or {}
    if 'name' in data:
        name = (data['name'] or '').strip()
        if not (1 <= len(name) <= 120):
            return {'error': 'name must be 1-120 chars'}, 400
        
        existing = Gym.query.filter_by(name=name).first()
        if existing is not None and existing.id != gym_id:
            return {'error': 'name already taken'}, 409

        gym.name = name

    if 'city' in data:
        city = (data['city'] or '').strip() or None
        if city and len(city) > 120:
            return {'error': 'city must be 1-120 chars'}, 400
        gym.city = city

    if 'country' in data:
        country = (data['country'] or '').strip() or None
        if country and len(country) > 120:
            return {'error': 'country must be 1-120 chars'}, 400
        gym.country = country

    db.session.commit()
    return gym_payload(gym)

@app.route('/api/admin/gyms/<int:gym_id>', methods=['DELETE'])
@admin_required
def remove_gym(gym_id):
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 404

    in_use = Plan.query.filter_by(gym_id=gym_id).first() is not None
    if in_use:
        return {'error' : 'gym is referenced by existing plans'}, 409

    db.session.delete(gym)
    db.session.commit()
    return '', 204

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
    }
    
@app.route('/api/plans', methods=['POST'])
@login_required
def create_plan():
    data = request.get_json(silent=True) or {}
    
    gym_id_raw = data.get('gym_id')
    if gym_id_raw is None:
        return {'error': 'gym_id is required'}, 400
    try:
        gym_id = int(gym_id_raw)
    except (ValueError, TypeError):
        return {'error': 'gym_id must be an integer'}, 400
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 400
    
    planned_at_str = data.get('planned_at')
    if not planned_at_str:
        return {'error': 'planned_at is required'}, 400
    try:
        planned_at = to_utc(datetime.fromisoformat(planned_at_str))
    except ValueError:
        return {'error': 'planned_at must be ISO 8601'}, 400
    if planned_at < datetime.now(timezone.utc):
        return {'error': 'planned_at must be in the future'}, 400
    
    note = data.get('note')
    if note is not None:
        note = note.strip()
        if len(note) > 500:
            return {'error': 'note must be at most 500 chars'}, 400
        if note == '':
            note = None
            
    plan = Plan(
        user_id=current_user.id,
        gym_id=gym_id,
        planned_at=planned_at,
        note=note,
    )
    
    db.session.add(plan)
    db.session.flush()
    
    db.session.add(PlanAttendee(
        plan_id=plan.id,
        user_id=current_user.id,
    ))
    
    db.session.commit()
    return plan_payload(plan), 201

@app.route('/api/plans', methods=['GET'])
@login_required
def list_plans():
    now = datetime.now(timezone.utc)
    week_out = now + timedelta(days=7)
    
    plans = (
        Plan.query
        .filter(Plan.planned_at >= now)
        .filter(
            or_(
                Plan.user_id == current_user.id,
                Plan.planned_at <= week_out,
            )
        )
        .order_by(Plan.planned_at.asc())
        .all()
    )
    
    return {'plans': [plan_payload(p) for p in plans]}

@app.route('/api/plans/<int:plan_id>/attendees', methods=['POST'])
@login_required
def join_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error': 'plan not found'}, 404

    existing = db.session.get(PlanAttendee, (plan_id, current_user.id))
    if existing is None:
        db.session.add(PlanAttendee(
            plan_id=plan_id,
            user_id=current_user.id,
        ))
        
        if plan.user_id != current_user.id:
            db.session.add(Notification(
                user_id=plan.user_id,
                actor_id=current_user.id,
                type='plan_join',
                plan_id=plan.id
            ))
        db.session.commit()
        if plan.user_id != current_user.id:
            prune_notifications(plan.user_id)
    
    return plan_payload(plan), 200

@app.route('/api/plans/<int:plan_id>/attendees', methods=['DELETE'])
@login_required
def leave_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error': 'plan not found'}, 404

    if plan.user_id == current_user.id:
        return {
            'error': 'organizer cannot leave; delete the plan instead'
        }, 400
        
    attendee = db.session.get(PlanAttendee, (plan_id, current_user.id))
    if attendee is not None:
        db.session.delete(attendee)
        db.session.commit()
    
    return plan_payload(plan), 200

@app.route('/api/plans/<int:plan_id>', methods=['PATCH'])
@login_required
def update_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error' : 'plan not found'}, 404
    if plan.user_id != current_user.id:
        return {'error' : 'not your plan'}, 403

    data = request.get_json(silent=True) or {}

    if 'gym_id' in data:
        try:
            gym_id = int(data['gym_id'])
        except (ValueError, TypeError):
            return {'error': 'gym_id must be an integer'}, 400
        gym = db.session.get(Gym, gym_id)
        if gym is None:
            return {'error': 'gym not found'}, 400
        plan.gym_id = gym_id

    if 'planned_at' in data:
        try:
            planned_at = to_utc(datetime.fromisoformat(data['planned_at']))
        except (ValueError, TypeError):
            return {'error': 'planned_at must be ISO 8601'}, 400
        if planned_at < datetime.now(timezone.utc):
            return {'error': 'planned_at must be in the future'}, 400
        plan.planned_at = planned_at

    if 'note' in data:
        note = data['note']
        if note is not None:
            note = note.strip()
            if len(note) > 500:
                return {'error': 'note must be at most 500 chars'}, 400
            if note == '':
                note = None
        plan.note = note

    db.session.commit()
    return plan_payload(plan)

@app.route('/api/plans/<int:plan_id>', methods=['DELETE'])
@login_required
def delete_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error' : 'plan not found'}, 404
    if plan.user_id != current_user.id:
        return {'error' : 'not your plan'}, 403

    PlanAttendee.query.filter_by(plan_id=plan_id).delete()
    
    db.session.delete(plan)
    db.session.commit()
    return '', 204

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
        'emoji': n.emoji,
    }
    
@app.route('/api/notifications', methods=['GET'])
@login_required
def list_notifications():
    notifications = (
        Notification.query
        .filter_by(user_id=current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(20)
        .all()
    )
    
    unread_count = (
        Notification.query
        .filter_by(user_id=current_user.id, is_read=False)
        .count()
    )
    
    return {
        'notifications' : [notification_payload(n) for n in notifications],
        'unread_count': unread_count
    }
    
@app.route('/api/notifications/read', methods=['POST'])
@login_required
def mark_notifications_read():
    data = request.get_json(silent=True) or {}
    ids = data.get('ids')

    q = Notification.query.filter_by(user_id=current_user.id, is_read=False)
    if isinstance(ids, list) and len(ids) > 0:
        # validate they're all ints
        try:
            ids = [int(x) for x in ids]
        except (ValueError, TypeError):
            return {'error': 'ids must be integers'}, 400
        q = q.filter(Notification.id.in_(ids))

    q.update({'is_read': True})
    db.session.commit()
    return {'ok': True}
    
    


@app.route("/media/<path:filepath>")
@login_required
def serve_media(filepath):
    response = send_from_directory(MEDIA_DIR, filepath)
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response

def send_plan_day_emails():
    with app.app_context():
        try:
            now_van = datetime.now(VANCOUVER_TZ)
            today_date = now_van.date()
            today_start_van = now_van.replace(hour=0, minute=0, second=0, microsecond=0)
            tomorrow_start_van = today_start_van + timedelta(days=1)
            today_start = today_start_van.astimezone(timezone.utc).replace(tzinfo=None)
            tomorrow_start = tomorrow_start_van.astimezone(timezone.utc).replace(tzinfo=None)

            plans = (
                Plan.query
                .filter(
                    Plan.planned_at >= today_start,
                    Plan.planned_at < tomorrow_start,
                    or_(Plan.email_sent_date == None, Plan.email_sent_date != today_date),
                )
                .all()
            )

            for plan in plans:
                result = db.session.execute(
                    sql_update(Plan)
                    .where(Plan.id == plan.id)
                    .where(or_(Plan.email_sent_date == None, Plan.email_sent_date != today_date))
                    .values(email_sent_date=today_date)
                )
                db.session.commit()
                if result.rowcount == 0:
                    continue

                attendee_ids = {a.user_id for a in plan.attendees}
                recipients = User.query.filter(
                    User.id.notin_(attendee_ids),
                    User.email_notifications_enabled == True,
                ).all()

                if not recipients:
                    continue

                organizer = plan.user
                gym_name = plan.gym.name
                count = len(attendee_ids)
                if count == 1:
                    going_phrase = f"{organizer.display_name} is heading to"
                elif count == 2:
                    going_phrase = f"{organizer.display_name} and 1 other are heading to"
                else:
                    going_phrase = f"{organizer.display_name} and {count - 1} others are heading to"

                dt = plan.planned_at
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                dt = dt.astimezone(VANCOUVER_TZ)
                hour = dt.strftime('%I').lstrip('0') or '12'
                time_str = hour + dt.strftime(':%M %p PT')

                plans_url = f"{FRONTEND_URL}/plans"
                for user in recipients:
                    settings_url = f"{FRONTEND_URL}/u/{user.username}?settings=notifications"
                    send_plan_notification_email(
                        user.email, going_phrase, gym_name, time_str, plans_url, settings_url
                    )
        except Exception as e:
            print(f'[scheduler] plan email job failed: {e}')


from apscheduler.schedulers.background import BackgroundScheduler
_scheduler = BackgroundScheduler(daemon=True, timezone=VANCOUVER_TZ)
_scheduler.add_job(send_plan_day_emails, 'cron', hour=8, minute=0, id='plan_day_emails', replace_existing=True)
_scheduler.start()


if __name__ == '__main__':
    app.run(debug=True, port=5000)
