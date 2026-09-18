from unittest.mock import patch

from conftest import make_user
from models import User


def _fake_token(sub, email, name='Test User', picture='http://pic'):
    return {'userinfo': {'sub': sub, 'email': email, 'name': name, 'picture': picture}}


def test_new_user_created_on_first_google_login(client, db):
    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.google.authorize_access_token.return_value = _fake_token('sub-1', 'alice@example.com')
        r = client.get('/api/auth/google/callback')
    assert r.status_code == 302

    user = User.query.filter_by(email='alice@example.com').first()
    assert user is not None
    assert user.google_sub == 'sub-1'
    assert user.email_verified is True

    r2 = client.get('/api/auth/me')
    assert r2.status_code == 200
    assert r2.get_json()['email'] == 'alice@example.com'


def test_existing_google_sub_logs_in_without_duplicate(client, db):
    make_user(db, username='bob', email='bob@example.com', google_sub='sub-bob')
    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.google.authorize_access_token.return_value = _fake_token('sub-bob', 'bob@example.com')
        r = client.get('/api/auth/google/callback')
    assert r.status_code == 302
    assert User.query.filter_by(email='bob@example.com').count() == 1


def test_google_login_links_unverified_password_placeholder(client, db):
    # Simulates a squatter registering a teammate's email via password signup
    # before the teammate ever logs in with Google.
    make_user(db, username='squat', email='teammate@example.com',
              password='attacker-password', email_verified=False, google_sub=None)

    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.google.authorize_access_token.return_value = _fake_token(
            'sub-teammate', 'teammate@example.com'
        )
        r = client.get('/api/auth/google/callback')

    # The real fix under test: this must NOT 500 with an IntegrityError from
    # inserting a second row with the same unique email.
    assert r.status_code == 302
    assert User.query.filter_by(email='teammate@example.com').count() == 1

    user = User.query.filter_by(email='teammate@example.com').first()
    assert user.google_sub == 'sub-teammate'
    assert user.email_verified is True
    # The squatter's password never proved ownership — it must be revoked.
    assert user.password_hash is None


def test_google_login_links_already_verified_account_without_wiping_password(client, db):
    # A user who legitimately verified via password signup, then later also
    # signs in with Google — this is account linking, not squatter cleanup,
    # so their password should survive.
    make_user(db, username='carol', email='carol@example.com',
              password='real-password', email_verified=True, google_sub=None)

    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.google.authorize_access_token.return_value = _fake_token(
            'sub-carol', 'carol@example.com'
        )
        r = client.get('/api/auth/google/callback')

    assert r.status_code == 302
    user = User.query.filter_by(email='carol@example.com').first()
    assert user.google_sub == 'sub-carol'
    assert user.password_hash is not None


def test_google_login_normalizes_email_case_for_linking(client, db):
    # Providers don't guarantee lowercase emails; without normalization this
    # would miss the existing row and create a duplicate account instead of
    # linking (see the fix in _oauth_login).
    make_user(db, username='dave', email='dave@example.com',
              password='real-password', email_verified=True, google_sub=None)

    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.google.authorize_access_token.return_value = _fake_token(
            'sub-dave', 'Dave@Example.com'
        )
        r = client.get('/api/auth/google/callback')

    assert r.status_code == 302
    assert User.query.filter_by(email='dave@example.com').count() == 1
    user = User.query.filter_by(email='dave@example.com').first()
    assert user.google_sub == 'sub-dave'
