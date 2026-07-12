import os
import pytest
import tempfile

os.environ.setdefault('FLASK_SECRET_KEY', 'test-secret')
os.environ.setdefault('GMAIL_APP_PASSWORD', '')

# Must be set BEFORE importing app: Flask-SQLAlchemy 3.x binds the engine at
# SQLAlchemy(app) time, so updating SQLALCHEMY_DATABASE_URI afterwards has no
# effect and tests would run against the real app.db.
_db_fd, _db_path = tempfile.mkstemp(suffix='.db')
os.environ['K2_DATABASE_URI'] = f'sqlite:///{_db_path}'

from app import app as flask_app, db as _db
from models import User, Post, Gym, Plan, PlanAttendee, Reaction, Notification, InviteAllowList


@pytest.fixture(scope='session')
def app():
    flask_app.config.update({
        'TESTING': True,
        'WTF_CSRF_ENABLED': False,
        'SESSION_COOKIE_SECURE': False,
    })
    with flask_app.app_context():
        # Hard guard: never run tests against the real database.
        assert _db_path in str(_db.engine.url), (
            f'tests are pointed at {_db.engine.url}, expected temp db {_db_path}'
        )
        _db.create_all()
        yield flask_app
        _db.drop_all()
    os.close(_db_fd)
    os.unlink(_db_path)


@pytest.fixture
def db(app):
    with app.app_context():
        yield _db
        _db.session.rollback()
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()


@pytest.fixture
def client(app):
    return app.test_client()


def make_user(db, username='alice', email='alice@example.com', is_admin=False):
    u = User(
        google_sub=f'sub_{username}',
        email=email,
        username=username,
        display_name=username.capitalize(),
        is_onboarded=True,
        is_admin=is_admin,
    )
    db.session.add(u)
    db.session.commit()
    return u


def login(client, user):
    with client.session_transaction() as sess:
        sess['_user_id'] = str(user.id)
        sess['_fresh'] = True
