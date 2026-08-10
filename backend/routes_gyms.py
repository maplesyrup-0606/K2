from flask import Blueprint
from flask_login import login_required

from models import Gym
from helpers import gym_payload

gyms_bp = Blueprint('gyms', __name__)


@gyms_bp.route('/api/gyms', methods=['GET'])
@login_required
def list_gyms():
    gyms = Gym.query.order_by(Gym.name.asc()).all()
    return {'gyms': [gym_payload(g) for g in gyms]}
