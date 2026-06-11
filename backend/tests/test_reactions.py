import pytest
from conftest import make_user, login
from models import Post, Reaction, Notification


def make_post(db, user, grade_scale='v', grade_value=3):
    p = Post(
        user_id=user.id,
        grade_scale=grade_scale,
        grade_value=grade_value,
        outcome='sent',
        attempts_bucket='1',
        photo_path=f'{user.id}/fake.jpg',
    )
    db.session.add(p)
    db.session.commit()
    return p


def test_reaction_notifies_post_owner(client, db):
    """Reacting to someone else's post creates a notification for the owner."""
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    post = make_post(db, alice)

    login(client, bob)
    resp = client.post(f'/api/posts/{post.id}/reactions', json={'emoji': '🔥'})
    assert resp.status_code == 200

    notif = Notification.query.filter_by(user_id=alice.id, actor_id=bob.id).first()
    assert notif is not None
    assert notif.type == 'reaction'
    assert notif.emoji == '🔥'


def test_reaction_on_own_post_no_notification(client, db):
    """Reacting to your own post must NOT create a notification."""
    alice = make_user(db, 'alice2', 'alice2@example.com')
    post = make_post(db, alice)

    login(client, alice)
    resp = client.post(f'/api/posts/{post.id}/reactions', json={'emoji': '💪'})
    assert resp.status_code == 200

    notif = Notification.query.filter_by(user_id=alice.id, actor_id=alice.id).first()
    assert notif is None


def test_reaction_no_duplicate_notification(client, db):
    """Adding the same reaction twice only creates one notification."""
    alice = make_user(db, 'alice3', 'alice3@example.com')
    bob = make_user(db, 'bob3', 'bob3@example.com')
    post = make_post(db, alice)

    login(client, bob)
    client.post(f'/api/posts/{post.id}/reactions', json={'emoji': '🔥'})
    client.post(f'/api/posts/{post.id}/reactions', json={'emoji': '🔥'})

    count = Notification.query.filter_by(user_id=alice.id, actor_id=bob.id).count()
    assert count == 1
