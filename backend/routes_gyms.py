from flask import Blueprint
from flask_login import current_user, login_required

from extensions import db
from models import FavoriteGym, Gym
from helpers import gym_payload

gyms_bp = Blueprint('gyms', __name__)


@gyms_bp.route('/api/gyms', methods=['GET'])
@login_required
def list_gyms():
    favorite_ids = {
        row.gym_id for row in FavoriteGym.query.filter_by(user_id=current_user.id)
    }
    gyms = Gym.query.order_by(Gym.name.asc()).all()
    return {'gyms': [gym_payload(g, is_favorite=g.id in favorite_ids) for g in gyms]}


@gyms_bp.route('/api/gyms/<int:gym_id>/favorite', methods=['POST'])
@login_required
def favorite_gym(gym_id):
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 404
    if db.session.get(FavoriteGym, (current_user.id, gym_id)) is None:
        db.session.add(FavoriteGym(user_id=current_user.id, gym_id=gym_id))
        db.session.commit()
    return gym_payload(gym, is_favorite=True)


@gyms_bp.route('/api/gyms/<int:gym_id>/favorite', methods=['DELETE'])
@login_required
def unfavorite_gym(gym_id):
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 404
    existing = db.session.get(FavoriteGym, (current_user.id, gym_id))
    if existing is not None:
        db.session.delete(existing)
        db.session.commit()
    return gym_payload(gym, is_favorite=False)
