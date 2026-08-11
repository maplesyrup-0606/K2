from dotenv import load_dotenv
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_cors import CORS
import os

from extensions import db, migrate, login_manager, oauth
from helpers import FRONTEND_URL

load_dotenv()
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

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

db.init_app(app)
migrate.init_app(app, db)
login_manager.init_app(app)
from models import User, InviteAllowList, Project, Post, Reaction, Gym, Plan, PlanAttendee, PlanInvite, Notification, Follow, SocialLink

oauth.init_app(app)
oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
            'scope':'openid email profile'
    }
)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


from routes_health import health_bp
from routes_auth import auth_bp
from routes_users import users_bp
from routes_posts import posts_bp
from routes_projects import projects_bp
from routes_plans import plans_bp
from routes_gyms import gyms_bp
from routes_admin import admin_bp
from routes_notifications import notifications_bp
from routes_media import media_bp
from routes_comments import comments_bp

app.register_blueprint(health_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(posts_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(plans_bp)
app.register_blueprint(gyms_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(media_bp)
app.register_blueprint(comments_bp)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
