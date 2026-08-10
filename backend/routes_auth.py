import os
from datetime import timedelta

from flask import Blueprint, url_for, redirect, abort
from flask_login import current_user, login_user, login_required, logout_user

from extensions import db, oauth
from models import User, InviteAllowList
from helpers import FRONTEND_URL, generate_unique_username, user_payload

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/auth/google/login')
def google_login():
    redirect_uri = os.getenv('OAUTH_REDIRECT_URI', url_for('auth.google_callback', _external=True))
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.route('/api/auth/google/callback')
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
