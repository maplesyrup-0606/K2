import re
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request
from flask_login import login_required, current_user

from extensions import db
from models import User, EmailInvite
from emailer import send_invite_email, run_in_background

invites_bp = Blueprint('invites', __name__)

# Every invite goes out from the operator's own Gmail account, so the cap is
# what stops one user from burning its sending reputation (or Gmail's daily
# send limit) on everyone else's behalf.
INVITES_PER_DAY = 10
RESEND_COOLDOWN = timedelta(days=7)
EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


@invites_bp.route('/api/invites', methods=['POST'])
@login_required
def send_invite():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    if len(email) > 255 or not EMAIL_PATTERN.match(email):
        return {'error': 'enter a valid email address'}, 400
    if email == current_user.email:
        return {'error': "that's your own email"}, 400

    now = datetime.now(timezone.utc)
    sent_today = EmailInvite.query.filter(
        EmailInvite.inviter_id == current_user.id,
        EmailInvite.created_at >= now - timedelta(days=1),
    ).count()
    if sent_today >= INVITES_PER_DAY:
        return {'error': f'invite limit reached ({INVITES_PER_DAY} per day) — try again tomorrow'}, 429

    # Both no-op paths below answer with the same success body as a real send:
    # anything else would let any logged-in user probe which emails have a
    # K2 account, and a repeat click shouldn't email the same person twice.
    already_invited = EmailInvite.query.filter(
        EmailInvite.inviter_id == current_user.id,
        EmailInvite.email == email,
        EmailInvite.created_at >= now - RESEND_COOLDOWN,
    ).first()
    already_member = User.query.filter_by(email=email).first()
    if already_invited or already_member:
        return {'sent': True}

    db.session.add(EmailInvite(inviter_id=current_user.id, email=email))
    db.session.commit()
    run_in_background(send_invite_email, email, current_user.display_name)
    return {'sent': True}
