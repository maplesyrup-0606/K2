from flask import Blueprint, send_from_directory
from flask_login import login_required

import app

media_bp = Blueprint('media', __name__)


@media_bp.route("/media/<path:filepath>")
@login_required
def serve_media(filepath):
    response = send_from_directory(app.MEDIA_DIR, filepath)
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response
