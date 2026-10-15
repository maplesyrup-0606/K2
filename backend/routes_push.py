import os

from flask import Blueprint, request
from flask_login import current_user, login_required

from extensions import db
from models import PushSubscription

push_bp = Blueprint('push', __name__)


@push_bp.route('/api/push/public-key', methods=['GET'])
@login_required
def push_public_key():
    return {'public_key': os.getenv('VAPID_PUBLIC_KEY')}


@push_bp.route('/api/push/subscribe', methods=['POST'])
@login_required
def push_subscribe():
    data = request.get_json(silent=True) or {}
    endpoint = data.get('endpoint')
    keys = data.get('keys') or {}
    p256dh = keys.get('p256dh')
    auth = keys.get('auth')
    if not endpoint or not p256dh or not auth:
        return {'error': 'endpoint and keys.p256dh/keys.auth are required'}, 400

    existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if existing is None:
        db.session.add(PushSubscription(
            user_id=current_user.id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
        ))
    else:
        # Same browser endpoint re-subscribing, possibly under a different
        # logged-in user (shared device) — keep the row pointed at whoever
        # just subscribed, and refresh the keys in case they rotated.
        existing.user_id = current_user.id
        existing.p256dh = p256dh
        existing.auth = auth
    db.session.commit()
    return {'subscribed': True}, 200


@push_bp.route('/api/push/subscribe', methods=['DELETE'])
@login_required
def push_unsubscribe():
    data = request.get_json(silent=True) or {}
    endpoint = data.get('endpoint')
    if endpoint:
        existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
        if existing is not None:
            db.session.delete(existing)
            db.session.commit()
    return {'subscribed': False}, 200
