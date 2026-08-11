from conftest import make_user, login
from models import Post, Comment, Notification


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


def test_top_level_comment_notifies_post_owner(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    post = make_post(db, alice)

    login(client, bob)
    resp = client.post(f'/api/posts/{post.id}/comments', json={'body': 'nice send!'})
    assert resp.status_code == 201
    comment_id = resp.get_json()['id']

    notif = Notification.query.filter_by(user_id=alice.id, actor_id=bob.id, type='comment').first()
    assert notif is not None
    assert notif.post_id == post.id
    assert notif.comment_id == comment_id


def test_top_level_comment_on_own_post_no_notification(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    post = make_post(db, alice)

    login(client, alice)
    resp = client.post(f'/api/posts/{post.id}/comments', json={'body': 'my own comment'})
    assert resp.status_code == 201
    assert Notification.query.count() == 0


def test_reply_notifies_comment_author_not_post_owner(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    carol = make_user(db, 'carol', 'carol@example.com')
    post = make_post(db, alice)

    login(client, bob)
    top = client.post(f'/api/posts/{post.id}/comments', json={'body': 'first!'}).get_json()
    Notification.query.delete()
    db.session.commit()

    login(client, carol)
    resp = client.post(
        f'/api/posts/{post.id}/comments',
        json={'body': 'agreed', 'reply_to_comment_id': top['id']},
    )
    assert resp.status_code == 201

    reply_notif = Notification.query.filter_by(type='comment_reply').all()
    assert len(reply_notif) == 1
    assert reply_notif[0].user_id == bob.id
    assert reply_notif[0].actor_id == carol.id
    # post owner (alice) should NOT get a separate notification for a reply
    assert Notification.query.filter_by(user_id=alice.id).count() == 0


def test_reply_to_a_reply_flattens_and_notifies_the_reply_author(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    carol = make_user(db, 'carol', 'carol@example.com')
    dave = make_user(db, 'dave', 'dave@example.com')
    post = make_post(db, alice)

    login(client, bob)
    top = client.post(f'/api/posts/{post.id}/comments', json={'body': 'top comment'}).get_json()

    login(client, carol)
    reply = client.post(
        f'/api/posts/{post.id}/comments',
        json={'body': 'a reply', 'reply_to_comment_id': top['id']},
    ).get_json()
    assert reply['parent_id'] == top['id']

    Notification.query.delete()
    db.session.commit()

    login(client, dave)
    resp = client.post(
        f'/api/posts/{post.id}/comments',
        json={'body': 'replying to the reply', 'reply_to_comment_id': reply['id']},
    )
    assert resp.status_code == 201
    data = resp.get_json()
    # flattened: parent_id points at the ORIGINAL top-level comment, not the reply
    assert data['parent_id'] == top['id']

    notif = Notification.query.filter_by(type='comment_reply').all()
    assert len(notif) == 1
    assert notif[0].user_id == carol.id  # the reply's author, not bob (top comment author)
    assert notif[0].actor_id == dave.id


def test_replying_to_own_comment_no_notification(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    post = make_post(db, alice)

    login(client, bob)
    top = client.post(f'/api/posts/{post.id}/comments', json={'body': 'top'}).get_json()
    Notification.query.delete()
    db.session.commit()

    resp = client.post(
        f'/api/posts/{post.id}/comments',
        json={'body': 'replying to myself', 'reply_to_comment_id': top['id']},
    )
    assert resp.status_code == 201
    assert Notification.query.count() == 0


def test_delete_top_level_comment_cascades_to_replies(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    post = make_post(db, alice)

    login(client, alice)
    top = client.post(f'/api/posts/{post.id}/comments', json={'body': 'top'}).get_json()

    login(client, bob)
    client.post(
        f'/api/posts/{post.id}/comments',
        json={'body': 'a reply', 'reply_to_comment_id': top['id']},
    )
    assert Comment.query.count() == 2

    login(client, alice)
    resp = client.delete(f'/api/comments/{top["id"]}')
    assert resp.status_code == 204
    assert Comment.query.count() == 0


def test_delete_someone_elses_comment_forbidden(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    post = make_post(db, alice)

    login(client, alice)
    top = client.post(f'/api/posts/{post.id}/comments', json={'body': 'top'}).get_json()

    login(client, bob)
    resp = client.delete(f'/api/comments/{top["id"]}')
    assert resp.status_code == 403
    assert Comment.query.count() == 1


def test_reply_to_comment_on_different_post_404(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    post1 = make_post(db, alice)
    post2 = make_post(db, alice)

    login(client, alice)
    top = client.post(f'/api/posts/{post1.id}/comments', json={'body': 'on post1'}).get_json()

    resp = client.post(
        f'/api/posts/{post2.id}/comments',
        json={'body': 'wrong post', 'reply_to_comment_id': top['id']},
    )
    assert resp.status_code == 404


def test_malformed_reply_to_comment_id_rejected(client, db):
    """A list/dict/float for reply_to_comment_id must 400, not 500."""
    alice = make_user(db, 'alice', 'alice@example.com')
    post = make_post(db, alice)

    login(client, alice)
    for bad_value in ([1, 2], {'a': 1}, 2.5):
        resp = client.post(
            f'/api/posts/{post.id}/comments',
            json={'body': 'hi', 'reply_to_comment_id': bad_value},
        )
        assert resp.status_code == 400, f'{bad_value!r} should 400, got {resp.status_code}'


def test_empty_and_too_long_body_rejected(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    post = make_post(db, alice)

    login(client, alice)
    assert client.post(f'/api/posts/{post.id}/comments', json={'body': ''}).status_code == 400
    assert client.post(f'/api/posts/{post.id}/comments', json={'body': '   '}).status_code == 400
    assert client.post(f'/api/posts/{post.id}/comments', json={'body': 'x' * 501}).status_code == 400


def test_list_comments_returns_nested_structure(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    post = make_post(db, alice)

    login(client, alice)
    top1 = client.post(f'/api/posts/{post.id}/comments', json={'body': 'first'}).get_json()
    top2 = client.post(f'/api/posts/{post.id}/comments', json={'body': 'second'}).get_json()

    login(client, bob)
    client.post(
        f'/api/posts/{post.id}/comments',
        json={'body': 'a reply to first', 'reply_to_comment_id': top1['id']},
    )

    resp = client.get(f'/api/posts/{post.id}/comments')
    assert resp.status_code == 200
    data = resp.get_json()['comments']
    assert [c['id'] for c in data] == [top1['id'], top2['id']]
    assert len(data[0]['replies']) == 1
    assert data[0]['replies'][0]['reply_to_user']['username'] == 'alice'
    assert data[1]['replies'] == []


def test_edit_own_comment_sets_edited_at(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    post = make_post(db, alice)

    login(client, alice)
    top = client.post(f'/api/posts/{post.id}/comments', json={'body': 'typo verison'}).get_json()
    assert top['edited_at'] is None

    resp = client.patch(f'/api/comments/{top["id"]}', json={'body': 'typo version'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['body'] == 'typo version'
    assert data['edited_at'] is not None
    assert Notification.query.count() == 0


def test_edit_someone_elses_comment_forbidden(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    post = make_post(db, alice)

    login(client, alice)
    top = client.post(f'/api/posts/{post.id}/comments', json={'body': 'top'}).get_json()

    login(client, bob)
    resp = client.patch(f'/api/comments/{top["id"]}', json={'body': 'hacked'})
    assert resp.status_code == 403
