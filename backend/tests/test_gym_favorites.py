from conftest import make_user, login

from models import FavoriteGym, Gym


def make_gym(db, name='Test Gym'):
    gym = Gym(name=name)
    db.session.add(gym)
    db.session.commit()
    return gym


def test_list_gyms_requires_login(client, db):
    make_gym(db, 'Test Gym')
    assert client.get('/api/gyms').status_code == 401


def test_list_gyms_marks_favorite_false_by_default(client, db):
    alice = make_user(db)
    gym = make_gym(db, 'Test Gym')
    login(client, alice)

    data = client.get('/api/gyms').get_json()
    assert data['gyms'] == [{
        'id': gym.id,
        'name': 'Test Gym',
        'city': None,
        'country': None,
        'created_at': data['gyms'][0]['created_at'],
        'is_favorite': False,
    }]


def test_favorite_and_unfavorite_gym(client, db):
    alice = make_user(db)
    gym = make_gym(db, 'Test Gym')
    login(client, alice)

    res = client.post(f'/api/gyms/{gym.id}/favorite')
    assert res.status_code == 200
    assert res.get_json()['is_favorite'] is True
    assert db.session.get(FavoriteGym, (alice.id, gym.id)) is not None

    data = client.get('/api/gyms').get_json()
    assert data['gyms'][0]['is_favorite'] is True

    res = client.delete(f'/api/gyms/{gym.id}/favorite')
    assert res.status_code == 200
    assert res.get_json()['is_favorite'] is False
    assert db.session.get(FavoriteGym, (alice.id, gym.id)) is None


def test_favorite_gym_is_idempotent(client, db):
    alice = make_user(db)
    gym = make_gym(db, 'Test Gym')
    login(client, alice)

    client.post(f'/api/gyms/{gym.id}/favorite')
    client.post(f'/api/gyms/{gym.id}/favorite')
    assert FavoriteGym.query.filter_by(user_id=alice.id, gym_id=gym.id).count() == 1


def test_favorite_gym_not_found(client, db):
    alice = make_user(db)
    login(client, alice)
    assert client.post('/api/gyms/999/favorite').status_code == 404


def test_favorites_are_per_user(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    gym = make_gym(db, 'Test Gym')

    login(client, alice)
    client.post(f'/api/gyms/{gym.id}/favorite')

    login(client, bob)
    data = client.get('/api/gyms').get_json()
    assert data['gyms'][0]['is_favorite'] is False
