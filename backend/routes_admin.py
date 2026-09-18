from flask import Blueprint, request

from extensions import db
from models import Gym, Plan
from helpers import iso_utc, admin_required, gym_payload

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
