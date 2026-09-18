from unittest.mock import patch

from werkzeug.security import check_password_hash

from conftest import make_user
from helpers import make_email_verify_token, make_password_reset_token
from models import User


def test_signup_creates_unverified_user(client, db):
    r = client.post('/api/auth/signup', json={
        'email': 'new@example.com', 'password': 'hunter22', 'display_name': 'New',
    })
    assert r.status_code == 201
    user = User.query.filter_by(email='new@example.com').first()
    assert user is not None
    assert user.email_verified is False
    assert check_password_hash(user.password_hash, 'hunter22')
    # Signup does not log the user in.
    r2 = client.get('/api/auth/me')
    assert r2.status_code == 401


def test_signup_rejects_weak_password(client, db):
    r = client.post('/api/auth/signup', json={'email': 'weak@example.com', 'password': 'short'})
    assert r.status_code == 400


def test_signup_rejects_invalid_email(client, db):
    r = client.post('/api/auth/signup', json={'email': 'not-an-email', 'password': 'hunter22'})
    assert r.status_code == 400


def test_signup_duplicate_verified_email_rejected(client, db):
    make_user(db, username='bob', email='bob@example.com', password='hunter22', email_verified=True)
    r = client.post('/api/auth/signup', json={'email': 'bob@example.com', 'password': 'other123'})
    assert r.status_code == 409


def test_signup_duplicate_unverified_email_overwrites(client, db):
    make_user(db, username='squat', email='squat@example.com', password='attacker1', email_verified=False)
    r = client.post('/api/auth/signup', json={'email': 'squat@example.com', 'password': 'realowner1'})
    assert r.status_code == 200
    user = User.query.filter_by(email='squat@example.com').first()
    assert check_password_hash(user.password_hash, 'realowner1')
    assert not check_password_hash(user.password_hash, 'attacker1')
    assert User.query.filter_by(email='squat@example.com').count() == 1


def test_login_success(client, db):
    make_user(db, username='carol', email='carol@example.com', password='hunter22', email_verified=True)
    r = client.post('/api/auth/login', json={'email': 'carol@example.com', 'password': 'hunter22'})
    assert r.status_code == 200
    r2 = client.get('/api/auth/me')
    assert r2.status_code == 200
    assert r2.get_json()['email'] == 'carol@example.com'


def test_login_wrong_password(client, db):
    make_user(db, username='dave', email='dave@example.com', password='hunter22', email_verified=True)
    r = client.post('/api/auth/login', json={'email': 'dave@example.com', 'password': 'wrongpass'})
    assert r.status_code == 401


def test_login_unknown_email(client, db):
    r = client.post('/api/auth/login', json={'email': 'nobody@example.com', 'password': 'hunter22'})
    assert r.status_code == 401


def test_login_unverified(client, db):
    make_user(db, username='erin', email='erin@example.com', password='hunter22', email_verified=False)
    r = client.post('/api/auth/login', json={'email': 'erin@example.com', 'password': 'hunter22'})
    assert r.status_code == 403
    assert r.get_json()['code'] == 'unverified'


def test_login_google_only_user_has_no_password(client, db):
    make_user(db, username='frank', email='frank@example.com')  # google_sub only, no password
    r = client.post('/api/auth/login', json={'email': 'frank@example.com', 'password': 'anything1'})
    assert r.status_code == 401


def test_verify_email_success(client, db):
    user = make_user(db, username='grace', email='grace@example.com', password='hunter22', email_verified=False)
    token = make_email_verify_token(user)
    r = client.post('/api/auth/verify-email', json={'token': token})
    assert r.status_code == 200
    refreshed = User.query.filter_by(email='grace@example.com').first()
    assert refreshed.email_verified is True


def test_verify_email_tampered_token(client, db):
    r = client.post('/api/auth/verify-email', json={'token': 'not-a-real-token'})
    assert r.status_code == 400


def test_verify_email_expired_token(client, db):
    user = make_user(db, username='heidi', email='heidi@example.com', password='hunter22', email_verified=False)
    token = make_email_verify_token(user)
    with patch('helpers.EMAIL_VERIFY_MAX_AGE', -1):
        r = client.post('/api/auth/verify-email', json={'token': token})
    assert r.status_code == 410


def test_resend_verification_always_ok(client, db):
    r = client.post('/api/auth/resend-verification', json={'email': 'doesnotexist@example.com'})
    assert r.status_code == 200
    assert r.get_json() == {'ok': True}


def test_forgot_password_always_ok(client, db):
    r = client.post('/api/auth/forgot-password', json={'email': 'doesnotexist@example.com'})
    assert r.status_code == 200
    assert r.get_json() == {'ok': True}


def test_forgot_and_reset_password_flow(client, db):
    user = make_user(db, username='ivan', email='ivan@example.com', password='hunter22', email_verified=True)
    r = client.post('/api/auth/forgot-password', json={'email': 'ivan@example.com'})
    assert r.status_code == 200

    token = make_password_reset_token(user)
    r2 = client.post('/api/auth/reset-password', json={'token': token, 'new_password': 'newpass99'})
    assert r2.status_code == 200

    r3 = client.post('/api/auth/login', json={'email': 'ivan@example.com', 'password': 'newpass99'})
    assert r3.status_code == 200

    r4 = client.post('/api/auth/login', json={'email': 'ivan@example.com', 'password': 'hunter22'})
    assert r4.status_code == 401


def test_reset_password_expired_token(client, db):
    user = make_user(db, username='judy', email='judy@example.com', password='hunter22', email_verified=True)
    token = make_password_reset_token(user)
    with patch('helpers.PASSWORD_RESET_MAX_AGE', -1):
        r = client.post('/api/auth/reset-password', json={'token': token, 'new_password': 'newpass99'})
    assert r.status_code == 410


def test_reset_password_weak_new_password(client, db):
    user = make_user(db, username='kevin', email='kevin@example.com', password='hunter22', email_verified=True)
    token = make_password_reset_token(user)
    r = client.post('/api/auth/reset-password', json={'token': token, 'new_password': 'short'})
    assert r.status_code == 400
