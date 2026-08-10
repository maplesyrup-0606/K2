"""Uninitialized Flask extension instances, shared across app.py and the
blueprint modules. Kept free of any `app`/`models` import so that models.py
can import `db` from here without a circular dependency on app.py."""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from authlib.integrations.flask_client import OAuth

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
oauth = OAuth()
