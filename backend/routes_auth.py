import json
import os
from datetime import timedelta

from flask import Blueprint, url_for, redirect, request
from flask_login import current_user, login_user, login_required, logout_user
from flask_limiter.util import get_remote_address
from itsdangerous import BadSignature, SignatureExpired
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db, oauth, limiter
from models import User
from helpers import (
    FRONTEND_URL, generate_unique_username, user_payload,
    make_email_verify_token, read_email_verify_token,
    make_password_reset_token, read_password_reset_token,
)
from emailer import send_verification_email, send_password_reset_email, send_welcome_email

auth_bp = Blueprint('auth', __name__)


def _request_email():
    data = request.get_json(silent=True) or {}
    return (data.get('email') or '').strip().lower()


def _ip_and_email_key():
    # Composite key rather than IP alone: K2's users plausibly share gym/
    # household wifi, so a pure per-IP limit risks one person's typo'd
    # attempts locking out friends on the same network.
    return f'{get_remote_address()}:{_request_email()}'


def _oauth_login(sub_field, sub, email, display_name, avatar_url):
    """Shared by google_callback and apple_callback: find-or-create-or-link
    a User by (provider, sub), then log them in. Factored out because both
    providers need the identical account-linking-by-email safety net."""
    # Providers don't guarantee lowercase emails; the password-auth paths
    # always normalize on write, so without this an OAuth login with
    # different casing than an existing row would miss the email lookup
    # below and create a duplicate account instead of linking.
    email = (email or '').strip().lower()
    user = User.query.filter_by(**{sub_field: sub}).first()

    if user is None:
        # No account has this provider identity yet. If an account already
        # exists under this email (e.g. an email/password signup, possibly
        # an unverified squatter placeholder), link onto it rather than
        # inserting a second row — a second insert would collide with the
        # unique constraint on email and 500 the real owner out.
        existing = User.query.filter_by(email=email).first()
        # Welcome email fires exactly once per account, at the moment it
        # first becomes real — a brand new OAuth account, or a password
        # placeholder claimed here for the first time. Not on later logins,
        # and not when OAuth is just added as a second method to an account
        # that was already verified (they got their welcome email already).
        send_welcome = existing is None or not existing.email_verified
        if existing is not None:
            was_verified = existing.email_verified
            setattr(existing, sub_field, sub)
            existing.email_verified = True
            if not existing.avatar_url and avatar_url:
                existing.avatar_url = avatar_url
            if not was_verified:
                # The prior password (if any) never proved ownership of this
                # inbox — an OAuth provider vouching for the email is strictly
                # stronger proof, so the unverified placeholder's password is
                # revoked rather than left attached to the now-claimed account.
                existing.password_hash = None
            user = existing
        else:
            user = User(
                email=email,
                username=generate_unique_username(),
                display_name=display_name or email.split('@')[0],
                avatar_url=avatar_url,
                email_verified=True,
                **{sub_field: sub},
            )
            db.session.add(user)

        db.session.commit()
        if send_welcome:
            send_welcome_email(email)

    login_user(user, remember=True, duration=timedelta(days=90))
    return user


@auth_bp.route('/api/auth/google/login')
def google_login():
    redirect_uri = os.getenv('OAUTH_REDIRECT_URI', url_for('auth.google_callback', _external=True))
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.route('/api/auth/google/callback')
def google_callback():
    token = oauth.google.authorize_access_token()
    user_info = token.get('userinfo')
    _oauth_login(
        'google_sub', user_info['sub'], user_info['email'],
        user_info.get('name'), user_info.get('picture'),
    )
    return redirect(FRONTEND_URL)


@auth_bp.route('/api/auth/apple/login')
def apple_login():
    redirect_uri = os.getenv('APPLE_OAUTH_REDIRECT_URI', url_for('auth.apple_callback', _external=True))
    return oauth.apple.authorize_redirect(redirect_uri, response_mode='form_post')


@auth_bp.route('/api/auth/apple/callback', methods=['POST'])
def apple_callback():
    # Apple's callback is a cross-site auto-submitting form POST (mandated
    # by response_mode=form_post whenever scope includes name/email), not a
    # GET redirect like Google's — untested against a real Apple Developer
    # account; see the plan's flagged SameSite/Lax risk before shipping.
    token = oauth.apple.authorize_access_token()
    claims = oauth.apple.parse_id_token(token)  # verifies signature+audience via Apple's JWKS
    email = claims.get('email')

    # Apple only includes the user's name on the FIRST authorization ever,
    # as a separate 'user' form field (not in the id_token) — must capture
    # it here or it's gone for good on subsequent logins.
    display_name = None
    user_field = request.form.get('user')
    if user_field:
        try:
            info = json.loads(user_field)
            name = info.get('name') or {}
            display_name = ' '.join(filter(None, [name.get('firstName'), name.get('lastName')])) or None
        except (ValueError, TypeError):
            pass

    _oauth_login('apple_sub', claims['sub'], email, display_name, None)
    return redirect(FRONTEND_URL)


@auth_bp.route('/api/auth/me')
def auth_me():
    if not current_user.is_authenticated:
        return {'user': None}, 401
    return user_payload(current_user)


@auth_bp.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return {'ok' : True}


@auth_bp.route('/api/auth/signup', methods=['POST'])
@limiter.limit('5 per hour')
def signup():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    display_name = (data.get('display_name') or '').strip()

    if not email or '@' not in email or len(email) > 255:
        return {'error': 'valid email required'}, 400
    if not (8 <= len(password) <= 128):
        return {'error': 'password must be 8-128 characters'}, 400

    existing = User.query.filter_by(email=email).first()
    if existing is not None:
        if existing.email_verified or existing.password_hash is None:
            # Either a real, claimed account, or an OAuth-only account that
            # was never a password placeholder — refuse either way, don't
            # allow overwrite.
            return {'error': 'an account with this email already exists'}, 409
        # Unverified password-signup placeholder: nobody has proven ownership
        # of this inbox yet. Whoever clicks the (latest) verification link
        # wins the account — this is what actually closes the squatting hole.
        existing.password_hash = generate_password_hash(password)
        existing.display_name = display_name or existing.display_name
        db.session.commit()
        send_verification_email(existing.email, make_email_verify_token(existing))
        return {'ok': True}, 200

    user = User(
        email=email,
        username=generate_unique_username(),
        display_name=display_name or email.split('@')[0],
        password_hash=generate_password_hash(password),
        email_verified=False,
    )
    db.session.add(user)
    db.session.commit()
    send_verification_email(user.email, make_email_verify_token(user))
    return {'ok': True}, 201


@auth_bp.route('/api/auth/login', methods=['POST'])
@limiter.limit('10 per minute', key_func=_ip_and_email_key)
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    if user is None or user.password_hash is None or not check_password_hash(user.password_hash, password):
        return {'error': 'invalid email or password'}, 401
    if not user.email_verified:
        return {'error': 'email not verified', 'code': 'unverified'}, 403

    login_user(user, remember=True, duration=timedelta(days=90))
    return user_payload(user)


@auth_bp.route('/api/auth/verify-email', methods=['POST'])
@limiter.limit('20 per hour')
def verify_email():
    token = (request.get_json(silent=True) or {}).get('token', '')
    try:
        data = read_email_verify_token(token)
    except SignatureExpired:
        return {'error': 'link expired'}, 410
    except BadSignature:
        return {'error': 'invalid link'}, 400

    user = db.session.get(User, data['uid'])
    if user is None or user.email != data['email']:
        return {'error': 'invalid link'}, 400
    user.email_verified = True
    db.session.commit()
    return {'ok': True}


@auth_bp.route('/api/auth/resend-verification', methods=['POST'])
@limiter.limit('3 per hour')
def resend_verification():
    email = _request_email()
    user = User.query.filter_by(email=email).first()
    if user is not None and not user.email_verified and user.password_hash is not None:
        send_verification_email(user.email, make_email_verify_token(user))
    # Always the same response — don't leak whether the email exists.
    return {'ok': True}


@auth_bp.route('/api/auth/forgot-password', methods=['POST'])
@limiter.limit('5 per hour', key_func=_ip_and_email_key)
def forgot_password():
    email = _request_email()
    user = User.query.filter_by(email=email).first()
    if user is not None and user.password_hash is not None:
        send_password_reset_email(user.email, make_password_reset_token(user))
    # Always the same response — don't leak whether the email exists.
    return {'ok': True}


@auth_bp.route('/api/auth/reset-password', methods=['POST'])
@limiter.limit('10 per hour')
def reset_password():
    data = request.get_json(silent=True) or {}
    token = data.get('token', '')
    new_password = data.get('new_password') or ''

    try:
        payload = read_password_reset_token(token)
    except SignatureExpired:
        return {'error': 'link expired'}, 410
    except BadSignature:
        return {'error': 'invalid link'}, 400

    if not (8 <= len(new_password) <= 128):
        return {'error': 'password must be 8-128 characters'}, 400

    user = db.session.get(User, payload['uid'])
    if user is None or user.email != payload['email']:
        return {'error': 'invalid link'}, 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return {'ok': True}
