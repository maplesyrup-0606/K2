from datetime import datetime, timedelta, timezone

from conftest import make_user, login

from models import Gym, Notification, PlanInvite


def make_gym(db, name='Test Gym'):
    gym = Gym(name=name)
    db.session.add(gym)
    db.session.commit()
    return gym


def future_iso(days=1):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def test_create_plan_without_invites(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    gym = make_gym(db)
    login(client, alice)

    resp = client.post('/api/plans', json={
        'gym_id': gym.id,
        'planned_at': future_iso(),
    })
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['invited'] == []
    assert len(data['attendees']) == 1


def test_create_plan_invites_followed_users(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    gym = make_gym(db)
    login(client, alice)

    client.post('/api/users/bob/follow')

    resp = client.post('/api/plans', json={
        'gym_id': gym.id,
        'planned_at': future_iso(),
        'invite_user_ids': [bob.id],
    })
    assert resp.status_code == 201
    data = resp.get_json()
    assert [u['id'] for u in data['invited']] == [bob.id]

    plan_id = data['id']
    assert PlanInvite.query.filter_by(plan_id=plan_id, user_id=bob.id).first() is not None

    notif = Notification.query.filter_by(user_id=bob.id, actor_id=alice.id, type='plan_invite').first()
    assert notif is not None
    assert notif.plan_id == plan_id


def test_create_plan_cannot_invite_unfollowed_user(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    gym = make_gym(db)
    login(client, alice)

    # alice does not follow bob
    resp = client.post('/api/plans', json={
        'gym_id': gym.id,
        'planned_at': future_iso(),
        'invite_user_ids': [bob.id],
    })
    assert resp.status_code == 400


def test_join_plan_notifies_organizer(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    gym = make_gym(db)
    login(client, alice)

    resp = client.post('/api/plans', json={
        'gym_id': gym.id,
        'planned_at': future_iso(),
    })
    plan_id = resp.get_json()['id']

    login(client, bob)
    resp = client.post(f'/api/plans/{plan_id}/attendees')
    assert resp.status_code == 200

    notif = Notification.query.filter_by(user_id=alice.id, actor_id=bob.id, type='plan_join').first()
    assert notif is not None
    assert notif.plan_id == plan_id
