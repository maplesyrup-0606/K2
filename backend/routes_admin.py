from flask import Blueprint, request

from extensions import db
from models import Gym, Plan, User
from helpers import iso_utc, admin_required, gym_payload, user_payload

admin_bp = Blueprint('admin', __name__)


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


def _find_user(identifier):
    """Resolve what an admin typed: an email (has an '@' past the first char),
    else a username (a leading '@' is allowed), else a numeric user id."""
    if '@' in identifier[1:]:
        return User.query.filter_by(email=identifier.lower()).first()
    username = identifier.lstrip('@')
    user = User.query.filter(db.func.lower(User.username) == username.lower()).first()
    if user is None and username.isdigit():
        user = db.session.get(User, int(username))
    return user


@admin_bp.route('/api/admin/admins', methods=['GET'])
@admin_required
def list_admins():
    admins = User.query.filter_by(is_admin=True).order_by(User.id).all()
    return {'admins': [user_payload(admin) for admin in admins]}


@admin_bp.route('/api/admin/admins', methods=['POST'])
@admin_required
def add_admin():
    data = request.get_json(silent=True) or {}
    identifier = (data.get('identifier') or '').strip()
    if not (1 <= len(identifier) <= 255):
        return {'error': 'enter an email, username, or user id'}, 400

    user = _find_user(identifier)
    if user is None:
        return {'error': 'no user found with that email, username, or id'}, 404
    if user.is_admin:
        return {'error': f'{user.display_name} is already an admin'}, 409
    # Signup lets a later registrant overwrite an unverified account, so
    # promoting one could hand admin to whoever completes that signup.
    if not user.email_verified:
        return {'error': f'{user.display_name} has not verified their email yet'}, 409

    user.is_admin = True
    db.session.commit()
    return user_payload(user), 201
