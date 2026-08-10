from conftest import make_user, login
from models import Post, Follow


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


def follow(db, follower, followed):
    db.session.add(Follow(follower_id=follower.id, followed_id=followed.id))
    db.session.commit()


def test_feed_all_returns_every_users_posts(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    make_post(db, alice)
    make_post(db, bob)

    login(client, alice)
    resp = client.get('/api/posts')
    assert resp.status_code == 200
    post_ids = {p['id'] for p in resp.get_json()['posts']}
    assert len(post_ids) == 2


def test_feed_default_is_all(client, db):
    """Omitting feed entirely behaves the same as feed=all."""
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    make_post(db, alice)
    make_post(db, bob)

    login(client, alice)
    resp = client.get('/api/posts?feed=all')
    assert len(resp.get_json()['posts']) == 2


def test_feed_following_includes_own_and_followed_excludes_others(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    carol = make_user(db, 'carol', 'carol@example.com')
    alice_post = make_post(db, alice)
    bob_post = make_post(db, bob)
    make_post(db, carol)  # alice does not follow carol

    follow(db, alice, bob)

    login(client, alice)
    resp = client.get('/api/posts?feed=following')
    assert resp.status_code == 200
    post_ids = {p['id'] for p in resp.get_json()['posts']}
    assert post_ids == {alice_post.id, bob_post.id}


def test_feed_following_with_no_follows_shows_only_own_posts(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    alice_post = make_post(db, alice)
    make_post(db, bob)

    login(client, alice)
    resp = client.get('/api/posts?feed=following')
    post_ids = {p['id'] for p in resp.get_json()['posts']}
    assert post_ids == {alice_post.id}


def test_feed_invalid_value_returns_400(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    login(client, alice)
    resp = client.get('/api/posts?feed=bogus')
    assert resp.status_code == 400


def test_feed_following_pagination(client, db):
    """Filtering happens before limit/offset, not after."""
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    follow(db, alice, bob)

    # 3 posts alice can see (own + bob's), 2 posts she can't (carol's, unfollowed)
    carol = make_user(db, 'carol', 'carol@example.com')
    for _ in range(3):
        make_post(db, bob)
    for _ in range(2):
        make_post(db, carol)

    login(client, alice)
    resp = client.get('/api/posts?feed=following&limit=2&offset=0')
    data = resp.get_json()
    assert len(data['posts']) == 2
    assert data['next_offset'] == 2

    resp2 = client.get('/api/posts?feed=following&limit=2&offset=2')
    data2 = resp2.get_json()
    assert len(data2['posts']) == 1
    assert data2['next_offset'] is None
