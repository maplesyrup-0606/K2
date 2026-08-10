from flask import Blueprint

health_bp = Blueprint('health', __name__)


@health_bp.route('/api/health', methods=['GET'])
def get_health():
    return {'ok': True}
