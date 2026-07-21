from conftest import make_user, login

from models import SocialLink


def test_set_bio(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    resp = client.patch('/api/users/me', json={'bio': 'Sends V6, projects V8.'})
    assert resp.status_code == 200
    assert resp.get_json()['bio'] == 'Sends V6, projects V8.'


def test_bio_too_long_rejected(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    resp = client.patch('/api/users/me', json={'bio': 'x' * 161})
    assert resp.status_code == 400


def test_bio_cleared_with_empty_string(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    client.patch('/api/users/me', json={'bio': 'hello'})
    resp = client.patch('/api/users/me', json={'bio': ''})
    assert resp.status_code == 200
    assert resp.get_json()['bio'] is None


def test_set_instagram_handle(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    resp = client.patch('/api/users/me', json={'instagram_handle': 'alice.climbs'})
    assert resp.status_code == 200
    assert resp.get_json()['instagram_handle'] == 'alice.climbs'
    assert SocialLink.query.filter_by(user_id=alice.id, platform='instagram').first().handle == 'alice.climbs'


def test_instagram_handle_normalizes_at_prefix_and_url(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    resp = client.patch('/api/users/me', json={'instagram_handle': '@alice.climbs'})
    assert resp.get_json()['instagram_handle'] == 'alice.climbs'

    resp = client.patch('/api/users/me', json={'instagram_handle': 'https://instagram.com/alice.climbs'})
    assert resp.get_json()['instagram_handle'] == 'alice.climbs'


def test_instagram_handle_invalid_rejected(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    resp = client.patch('/api/users/me', json={'instagram_handle': 'not valid!'})
    assert resp.status_code == 400


def test_instagram_handle_cleared_with_empty_string(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    client.patch('/api/users/me', json={'instagram_handle': 'alice.climbs'})
    resp = client.patch('/api/users/me', json={'instagram_handle': ''})
    assert resp.status_code == 200
    assert resp.get_json()['instagram_handle'] is None
    assert SocialLink.query.filter_by(user_id=alice.id, platform='instagram').first() is None


def test_public_profile_includes_bio_and_instagram(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    login(client, alice)
    client.patch('/api/users/me', json={'bio': 'hi', 'instagram_handle': 'alice.climbs'})

    login(client, bob)
    resp = client.get('/api/users/alice')
    data = resp.get_json()
    assert data['bio'] == 'hi'
    assert data['instagram_handle'] == 'alice.climbs'
