from flask import Blueprint, request
from flask_login import current_user, login_required

from extensions import db
from models import Notification
from helpers import notification_payload

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('/api/notifications', methods=['GET'])
@login_required
def list_notifications():
    notifications = (
        Notification.query
        .filter_by(user_id=current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(20)
        .all()
    )

    unread_count = (
        Notification.query
        .filter_by(user_id=current_user.id, is_read=False)
        .count()
    )

    return {
        'notifications' : [notification_payload(n) for n in notifications],
        'unread_count': unread_count
    }

@notifications_bp.route('/api/notifications/read', methods=['POST'])
@login_required
def mark_notifications_read():
    data = request.get_json(silent=True) or {}
    ids = data.get('ids')

    q = Notification.query.filter_by(user_id=current_user.id, is_read=False)
    if isinstance(ids, list) and len(ids) > 0:
        # validate they're all ints
        try:
            ids = [int(x) for x in ids]
        except (ValueError, TypeError):
            return {'error': 'ids must be integers'}, 400
        q = q.filter(Notification.id.in_(ids))

    q.update({'is_read': True})
    db.session.commit()
    return {'ok': True}
