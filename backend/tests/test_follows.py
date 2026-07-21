from conftest import make_user, login

from models import Follow, Notification


def test_follow_requires_login(client, db):
    make_user(db, username='bob', email='bob@example.com')
    assert client.post('/api/users/bob/follow').status_code == 401


def test_follow_and_state(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    login(client, alice)

    res = client.post('/api/users/bob/follow')
    assert res.status_code == 200
    data = res.get_json()
    assert data['is_following'] is True
    assert data['follower_count'] == 1
    assert data['following_count'] == 0

    # reflected in bob's profile payload
    profile = client.get('/api/users/bob').get_json()
    assert profile['is_following'] is True
    assert profile['follower_count'] == 1

    # and in alice's own profile as following_count
    own = client.get('/api/users/alice').get_json()
    assert own['following_count'] == 1
    assert own['follower_count'] == 0


def test_follow_is_idempotent(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    make_user(db, username='bob', email='bob@example.com')
    login(client, alice)

    client.post('/api/users/bob/follow')
    res = client.post('/api/users/bob/follow')
    assert res.status_code == 200
    assert res.get_json()['follower_count'] == 1
    assert Follow.query.count() == 1


def test_cannot_follow_self(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)
    res = client.post('/api/users/alice/follow')
    assert res.status_code == 400


def test_follow_unknown_user_404(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)
    assert client.post('/api/users/nobody/follow').status_code == 404
    assert client.delete('/api/users/nobody/follow').status_code == 404


def test_unfollow(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    make_user(db, username='bob', email='bob@example.com')
    login(client, alice)

    client.post('/api/users/bob/follow')
    res = client.delete('/api/users/bob/follow')
    assert res.status_code == 200
    data = res.get_json()
    assert data['is_following'] is False
    assert data['follower_count'] == 0
    assert Follow.query.count() == 0

    # unfollow when not following is a no-op
    assert client.delete('/api/users/bob/follow').status_code == 200


def test_follow_notifies_followed_user(client, db):
    """Following someone creates a notification for the person followed."""
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    login(client, alice)

    resp = client.post('/api/users/bob/follow')
    assert resp.status_code == 200

    notif = Notification.query.filter_by(user_id=bob.id, actor_id=alice.id).first()
    assert notif is not None
    assert notif.type == 'follow'


def test_follow_no_duplicate_notification(client, db):
    """Following the same user twice only creates one notification."""
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    login(client, alice)

    client.post('/api/users/bob/follow')
    client.post('/api/users/bob/follow')

    count = Notification.query.filter_by(user_id=bob.id, actor_id=alice.id, type='follow').count()
    assert count == 1


def test_follows_are_directional(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    login(client, alice)
    client.post('/api/users/bob/follow')

    # bob does not follow alice back
    login(client, bob)
    profile = client.get('/api/users/alice').get_json()
    assert profile['is_following'] is False
    assert profile['follower_count'] == 0
    assert profile['following_count'] == 1
