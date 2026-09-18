import json
from unittest.mock import patch

from conftest import make_user
from models import User


def _fake_claims(sub, email):
    return {'sub': sub, 'email': email}


def test_new_user_created_on_first_apple_login(client, db):
    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.apple.authorize_access_token.return_value = {}
        mock_oauth.apple.parse_id_token.return_value = _fake_claims('apple-sub-1', 'alice@example.com')
        r = client.post(
            '/api/auth/apple/callback',
            data={'user': json.dumps({'name': {'firstName': 'Alice', 'lastName': 'A'}})},
        )
    assert r.status_code == 302

    user = User.query.filter_by(email='alice@example.com').first()
    assert user is not None
    assert user.apple_sub == 'apple-sub-1'
    assert user.email_verified is True
    assert user.display_name == 'Alice A'


def test_apple_login_without_name_field_falls_back_to_email(client, db):
    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.apple.authorize_access_token.return_value = {}
        mock_oauth.apple.parse_id_token.return_value = _fake_claims('apple-sub-2', 'bob@example.com')
        r = client.post('/api/auth/apple/callback', data={})
    assert r.status_code == 302
    user = User.query.filter_by(email='bob@example.com').first()
    assert user.display_name == 'bob'


def test_existing_apple_sub_logs_in_without_duplicate(client, db):
    user = make_user(db, username='carol', email='carol@example.com', google_sub=None)
    user.apple_sub = 'apple-sub-carol'
    db.session.commit()

    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.apple.authorize_access_token.return_value = {}
        mock_oauth.apple.parse_id_token.return_value = _fake_claims('apple-sub-carol', 'carol@example.com')
        r = client.post('/api/auth/apple/callback', data={})
    assert r.status_code == 302
    assert User.query.filter_by(email='carol@example.com').count() == 1


def test_apple_login_links_unverified_password_placeholder(client, db):
    # Same squatting-prevention guarantee as Google, exercised via Apple.
    make_user(db, username='squat', email='teammate@example.com',
              password='attacker-password', email_verified=False, google_sub=None)

    with patch('routes_auth.oauth') as mock_oauth:
        mock_oauth.apple.authorize_access_token.return_value = {}
        mock_oauth.apple.parse_id_token.return_value = _fake_claims(
            'apple-sub-teammate', 'teammate@example.com'
        )
        r = client.post('/api/auth/apple/callback', data={})

    assert r.status_code == 302
    assert User.query.filter_by(email='teammate@example.com').count() == 1
    user = User.query.filter_by(email='teammate@example.com').first()
    assert user.apple_sub == 'apple-sub-teammate'
    assert user.email_verified is True
    assert user.password_hash is None
