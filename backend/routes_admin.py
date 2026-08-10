import os
import smtplib
from email.mime.text import MIMEText

from flask import Blueprint, request
from flask_login import current_user

from extensions import db
from models import InviteAllowList, Gym, Plan
from helpers import iso_utc, admin_required, gym_payload

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/api/admin/invites', methods=['GET'])
@admin_required
def list_invites():
    invites = InviteAllowList.query.order_by(InviteAllowList.created_at.desc()).all()
    return {
        'invites': [
            {
                'email': inv.email,
                'invited_by': inv.invited_by,
                'created_at': iso_utc(inv.created_at)
            }
            for inv in invites
        ]
    }

GMAIL_FROM = os.getenv('GMAIL_FROM', 'mercurymcindoe@gmail.com')

def _send_email(to_email, subject, html):
    password = os.getenv('GMAIL_APP_PASSWORD')
    if not password:
        print('[email] skipped — GMAIL_APP_PASSWORD not set')
        return
    msg = MIMEText(html, 'html')
    msg['Subject'] = subject
    msg['From'] = f'K2 <{GMAIL_FROM}>'
    msg['To'] = to_email
    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(GMAIL_FROM, password)
            smtp.sendmail(GMAIL_FROM, to_email, msg.as_string())
        print(f'[email] "{subject}" sent to {to_email}')
    except Exception as e:
        print(f'[email] failed to send to {to_email}: {e}')


def send_invite_email(to_email):
    app_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0c0a09;color:#f5f5f4;border-radius:12px;">
      <h1 style="font-size:48px;font-weight:800;color:#863bff;margin:0 0 8px;">K2</h1>
      <p style="color:#a8a29e;margin:0 0 24px;">Climbing log for friends</p>
      <p style="margin:0 0 32px;">You've been invited. Tap below to install the app and get started.</p>
      <a href="{app_url}/install" style="display:inline-block;background:#863bff;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Get started →</a>
    </div>
    """
    _send_email(to_email, "You've been invited to K2", html)


@admin_bp.route('/api/admin/invites', methods=['POST'])
@admin_required
def add_invite():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email or len(email) > 255:
        return {'error': 'valid email required'}, 400

    existing = db.session.get(InviteAllowList, email)
    if existing is not None:
        return {
            'email': existing.email,
            'invited_by': existing.invited_by,
            'created_at': iso_utc(existing.created_at),
        }, 200

    invite = InviteAllowList(email=email, invited_by=current_user.id)
    db.session.add(invite)
    db.session.commit()
    send_invite_email(email)
    return {
        'email': invite.email,
        'invited_by': invite.invited_by,
        'created_at': iso_utc(invite.created_at),
    }, 201

@admin_bp.route('/api/admin/invites/<email>', methods=['DELETE'])
@admin_required
def remove_invite(email):
    inv = db.session.get(InviteAllowList, email)
    if inv is not None:
        db.session.delete(inv)
        db.session.commit()

    return '', 204


@admin_bp.route('/api/admin/gyms', methods=['POST'])
@admin_required
def add_gym():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()

    if not (1 <= len(name) <= 120):
        return {'error': 'name must be 1-120 chars'}, 400

    city = (data.get('city') or '').strip() or None
    if city and len(city) > 120:
        return {'error': 'city must be 1-120 chars'}, 400

    country = (data.get('country') or '').strip() or None
    if country and len(country) > 120:
        return {'error': 'country must be 1-120 chars'}, 400

    existing = Gym.query.filter_by(name=name).first()
    if existing is not None:
        return gym_payload(existing), 200

    gym = Gym(name=name, city=city, country=country)
    db.session.add(gym)
    db.session.commit()
    return gym_payload(gym), 201

@admin_bp.route('/api/admin/gyms/<int:gym_id>', methods=['PATCH'])
@admin_required
def update_gym(gym_id):
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 404

    data = request.get_json(silent=True) or {}
    if 'name' in data:
        name = (data['name'] or '').strip()
        if not (1 <= len(name) <= 120):
            return {'error': 'name must be 1-120 chars'}, 400

        existing = Gym.query.filter_by(name=name).first()
        if existing is not None and existing.id != gym_id:
            return {'error': 'name already taken'}, 409

        gym.name = name

    if 'city' in data:
        city = (data['city'] or '').strip() or None
        if city and len(city) > 120:
            return {'error': 'city must be 1-120 chars'}, 400
        gym.city = city

    if 'country' in data:
        country = (data['country'] or '').strip() or None
        if country and len(country) > 120:
            return {'error': 'country must be 1-120 chars'}, 400
        gym.country = country

    db.session.commit()
    return gym_payload(gym)

@admin_bp.route('/api/admin/gyms/<int:gym_id>', methods=['DELETE'])
@admin_required
def remove_gym(gym_id):
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 404

    in_use = Plan.query.filter_by(gym_id=gym_id).first() is not None
    if in_use:
        return {'error' : 'gym is referenced by existing plans'}, 409

    db.session.delete(gym)
    db.session.commit()
    return '', 204
