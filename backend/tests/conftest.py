import os
import pytest
import tempfile

os.environ.setdefault('FLASK_SECRET_KEY', 'test-secret')
os.environ.setdefault('GMAIL_APP_PASSWORD', '')

from app import app as flask_app, db as _db
from models import User, Post, Gym, Plan, PlanAttendee, Reaction, Notification, InviteAllowList


@pytest.fixture(scope='session')
def app():
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    flask_app.config.update({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}',
        'WTF_CSRF_ENABLED': False,
        'SESSION_COOKIE_SECURE': False,
    })
    with flask_app.app_context():
        _db.create_all()
        yield flask_app
        _db.drop_all()
    os.close(db_fd)
    os.unlink(db_path)


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
