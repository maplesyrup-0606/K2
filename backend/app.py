from dotenv import load_dotenv
from flask import Flask, url_for, redirect, abort, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager, current_user, login_user, login_required, logout_user
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth
import os, re, secrets


load_dotenv()
app = Flask(__name__)

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

db = SQLAlchemy(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
from models import User, InviteAllowList  # noqa: E402 — must come after `db` is created

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
    return redirect('/')

def user_payload(user):
    return {
        'id': user.id,
        'email': user.email,
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url,
        'is_onboarded': user.is_onboarded,
    }


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


if __name__ == '__main__':
    app.run(debug=True, port=5000)
