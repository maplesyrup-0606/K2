import pytest
from conftest import make_user, login
from models import InviteAllowList


def test_add_invite_returns_201(client, db):
    admin = make_user(db, 'admin', 'admin@example.com', is_admin=True)
    login(client, admin)

    resp = client.post('/api/admin/invites', json={'email': 'new@example.com'})
    assert resp.status_code == 201
    assert resp.json['email'] == 'new@example.com'


def test_add_invite_duplicate_returns_200(client, db):
    admin = make_user(db, 'admin2', 'admin2@example.com', is_admin=True)
    login(client, admin)

    client.post('/api/admin/invites', json={'email': 'dup@example.com'})
    resp = client.post('/api/admin/invites', json={'email': 'dup@example.com'})
    assert resp.status_code == 200


def test_add_invite_preserves_original_invited_by(client, db):
    admin1 = make_user(db, 'admin3', 'admin3@example.com', is_admin=True)
    admin2 = make_user(db, 'admin4', 'admin4@example.com', is_admin=True)

    login(client, admin1)
    client.post('/api/admin/invites', json={'email': 'shared@example.com'})

    login(client, admin2)
    resp = client.post('/api/admin/invites', json={'email': 'shared@example.com'})
    assert resp.status_code == 200
    assert resp.json['invited_by'] == admin1.id


def test_add_invite_requires_admin(client, db):
    user = make_user(db, 'pleb', 'pleb@example.com')
    login(client, user)

    resp = client.post('/api/admin/invites', json={'email': 'x@example.com'})
    assert resp.status_code == 403


def test_add_invite_invalid_email(client, db):
    admin = make_user(db, 'admin5', 'admin5@example.com', is_admin=True)
    login(client, admin)

    resp = client.post('/api/admin/invites', json={'email': 'notanemail'})
    assert resp.status_code == 400
