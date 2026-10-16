from conftest import make_user, login
from models import Notification


def add_notifications(db, recipient, actor, count):
    for _ in range(count):
        db.session.add(Notification(user_id=recipient.id, actor_id=actor.id, type='follow'))
    db.session.commit()


def test_list_pages_with_next_offset(db, client):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    add_notifications(db, alice, bob, 5)
    login(client, alice)

    first = client.get('/api/notifications?limit=2').get_json()
    assert len(first['notifications']) == 2
    assert first['next_offset'] == 2
    assert first['unread_count'] == 5

    last = client.get('/api/notifications?limit=2&offset=4').get_json()
    assert len(last['notifications']) == 1
    assert last['next_offset'] is None


def test_list_rejects_non_integer_paging(db, client):
    alice = make_user(db, 'alice', 'alice@example.com')
    login(client, alice)
    assert client.get('/api/notifications?limit=abc').status_code == 400


def test_mark_single_read_leaves_others_unread(db, client):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    add_notifications(db, alice, bob, 2)
    login(client, alice)

    first_id = client.get('/api/notifications').get_json()['notifications'][0]['id']
    client.post('/api/notifications/read', json={'ids': [first_id]})
    assert client.get('/api/notifications').get_json()['unread_count'] == 1
