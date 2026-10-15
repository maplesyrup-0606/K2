from types import SimpleNamespace

import pytest

import helpers
from conftest import make_user, login
from models import Gym, PushSubscription
from pywebpush import WebPushException


@pytest.fixture
def inline_push(monkeypatch):
    """Runs the "background" push send inline so tests don't race a real
    thread, mirroring test_invites.py's `sent` fixture for emails."""
    monkeypatch.setattr(helpers, 'run_in_background', lambda func, *args: func(*args))
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'test-key')


def make_gym(db, name='Test Gym'):
    gym = Gym(name=name)
    db.session.add(gym)
    db.session.commit()
    return gym


def make_subscription(db, user, endpoint='https://push.example.com/abc'):
    sub = PushSubscription(user_id=user.id, endpoint=endpoint, p256dh='p256dh-key', auth='auth-key')
    db.session.add(sub)
    db.session.commit()
    return sub


def test_subscribe_requires_login(client, db):
    assert client.post('/api/push/subscribe', json={
        'endpoint': 'https://push.example.com/abc',
        'keys': {'p256dh': 'p', 'auth': 'a'},
    }).status_code == 401


def test_subscribe_creates_row(client, db):
    alice = make_user(db)
    login(client, alice)

    res = client.post('/api/push/subscribe', json={
        'endpoint': 'https://push.example.com/abc',
        'keys': {'p256dh': 'p', 'auth': 'a'},
    })
    assert res.status_code == 200
    assert res.get_json()['subscribed'] is True
    sub = PushSubscription.query.filter_by(endpoint='https://push.example.com/abc').first()
    assert sub is not None
    assert sub.user_id == alice.id


def test_subscribe_missing_fields_rejected(client, db):
    alice = make_user(db)
    login(client, alice)

    res = client.post('/api/push/subscribe', json={'endpoint': 'https://push.example.com/abc'})
    assert res.status_code == 400
    assert PushSubscription.query.count() == 0


def test_subscribe_same_endpoint_upserts_not_duplicates(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    endpoint = 'https://push.example.com/shared-device'

    login(client, alice)
    client.post('/api/push/subscribe', json={'endpoint': endpoint, 'keys': {'p256dh': 'p1', 'auth': 'a1'}})

    login(client, bob)
    client.post('/api/push/subscribe', json={'endpoint': endpoint, 'keys': {'p256dh': 'p2', 'auth': 'a2'}})

    assert PushSubscription.query.count() == 1
    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    assert sub.user_id == bob.id
    assert sub.p256dh == 'p2'


def test_unsubscribe_deletes_and_is_idempotent(client, db):
    alice = make_user(db)
    login(client, alice)
    make_subscription(db, alice)

    res = client.delete('/api/push/subscribe', json={'endpoint': 'https://push.example.com/abc'})
    assert res.status_code == 200
    assert res.get_json()['subscribed'] is False
    assert PushSubscription.query.count() == 0

    # Deleting again (already gone) is still a 200, not an error.
    res = client.delete('/api/push/subscribe', json={'endpoint': 'https://push.example.com/abc'})
    assert res.status_code == 200


def test_public_key_reflects_env(client, db, monkeypatch):
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'test-public-key')
    alice = make_user(db)
    login(client, alice)

    res = client.get('/api/push/public-key')
    assert res.status_code == 200
    assert res.get_json()['public_key'] == 'test-public-key'


def test_send_push_calls_webpush_per_subscription(db, inline_push, monkeypatch):
    alice = make_user(db)
    make_subscription(db, alice, endpoint='https://push.example.com/one')
    make_subscription(db, alice, endpoint='https://push.example.com/two')

    calls = []
    monkeypatch.setattr(helpers, 'webpush', lambda **kwargs: calls.append(kwargs))

    helpers.send_push(alice.id, title='Hi', body='There', tag='t', url='/posts/1')
    assert len(calls) == 2
    assert calls[0]['subscription_info']['endpoint'] in (
        'https://push.example.com/one', 'https://push.example.com/two',
    )


def test_send_push_swallows_generic_failure(db, inline_push, monkeypatch):
    alice = make_user(db)
    make_subscription(db, alice)

    def boom(**kwargs):
        raise RuntimeError('push service unreachable')
    monkeypatch.setattr(helpers, 'webpush', boom)

    # Must not raise — a dead push service can't be allowed to break the
    # request (like/comment/invite) that triggered it.
    helpers.send_push(alice.id, title='Hi', body='There')
    assert PushSubscription.query.count() == 1


def test_send_push_deletes_subscription_on_410(db, inline_push, monkeypatch):
    alice = make_user(db)
    make_subscription(db, alice)

    def gone(**kwargs):
        raise WebPushException('gone', response=SimpleNamespace(status_code=410))
    monkeypatch.setattr(helpers, 'webpush', gone)

    helpers.send_push(alice.id, title='Hi', body='There')
    assert PushSubscription.query.count() == 0


def test_send_push_keeps_subscription_on_other_errors(db, inline_push, monkeypatch):
    alice = make_user(db)
    make_subscription(db, alice)

    def server_error(**kwargs):
        raise WebPushException('oops', response=SimpleNamespace(status_code=500))
    monkeypatch.setattr(helpers, 'webpush', server_error)

    helpers.send_push(alice.id, title='Hi', body='There')
    assert PushSubscription.query.count() == 1


def test_send_push_noop_without_vapid_key(db, monkeypatch):
    monkeypatch.setattr(helpers, 'run_in_background', lambda func, *args: func(*args))
    monkeypatch.delenv('VAPID_PRIVATE_KEY', raising=False)
    alice = make_user(db)
    make_subscription(db, alice)

    calls = []
    monkeypatch.setattr(helpers, 'webpush', lambda **kwargs: calls.append(kwargs))

    helpers.send_push(alice.id, title='Hi', body='There')
    assert calls == []


def test_reaction_triggers_push_with_like_count(client, db, inline_push, monkeypatch):
    import routes_posts
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    gym = make_gym(db)

    from models import Post
    post = Post(
        user_id=alice.id, grade_scale='v', grade_value=3, outcome='sent',
        attempts_bucket='1', photo_path='x.jpg', hold_color='#000000', gym_id=gym.id,
    )
    db.session.add(post)
    db.session.commit()

    pushes = []
    monkeypatch.setattr(routes_posts, 'send_push', lambda *a, **k: pushes.append((a, k)))

    login(client, bob)
    res = client.post(f'/api/posts/{post.id}/reactions', json={'emoji': '🔥'})
    assert res.status_code == 200
    assert len(pushes) == 1
    args, kwargs = pushes[0]
    assert args[0] == alice.id
    assert kwargs['tag'] == f'reaction-post-{post.id}'


def test_self_reaction_does_not_push(client, db, inline_push, monkeypatch):
    import routes_posts
    alice = make_user(db)
    gym = make_gym(db)
    from models import Post
    post = Post(
        user_id=alice.id, grade_scale='v', grade_value=3, outcome='sent',
        attempts_bucket='1', photo_path='x.jpg', hold_color='#000000', gym_id=gym.id,
    )
    db.session.add(post)
    db.session.commit()

    pushes = []
    monkeypatch.setattr(routes_posts, 'send_push', lambda *a, **k: pushes.append((a, k)))

    login(client, alice)
    client.post(f'/api/posts/{post.id}/reactions', json={'emoji': '🔥'})
    assert pushes == []


def test_plan_invite_triggers_push(client, db, inline_push, monkeypatch):
    import routes_plans
    from datetime import datetime, timedelta, timezone
    from models import Follow

    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    db.session.add(Follow(follower_id=alice.id, followed_id=bob.id))
    db.session.commit()
    gym = make_gym(db)

    pushes = []
    monkeypatch.setattr(routes_plans, 'send_push', lambda *a, **k: pushes.append((a, k)))

    login(client, alice)
    planned_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    res = client.post('/api/plans', json={
        'gym_id': gym.id, 'planned_at': planned_at, 'invite_user_ids': [bob.id],
    })
    assert res.status_code == 201
    assert len(pushes) == 1
    args, kwargs = pushes[0]
    assert args[0] == bob.id
    assert kwargs['url'] == '/plans'
