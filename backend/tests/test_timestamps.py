from datetime import datetime, timezone

from conftest import make_user, login

from models import Post


def _is_utc_aware(iso_str):
    """Payload timestamps must parse as timezone-aware UTC instants.

    Offset-less ISO strings get interpreted as device-local time by
    JavaScript's Date, shifting every timestamp by the UTC offset.
    """
    dt = datetime.fromisoformat(iso_str)
    return dt.tzinfo is not None and dt.utcoffset().total_seconds() == 0


def make_post(db, user):
    post = Post(
        user_id=user.id,
        grade_scale='v',
        grade_value=4,
        outcome='sent',
        attempts_bucket='2',
        photo_path=f'{user.id}/post.jpg',
    )
    db.session.add(post)
    db.session.commit()
    return post


def test_user_payload_timestamps_carry_utc_offset(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)
    profile = client.get('/api/users/alice').get_json()
    assert _is_utc_aware(profile['created_at'])


def test_post_payload_timestamps_carry_utc_offset(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    make_post(db, alice)
    login(client, alice)
    post = client.get('/api/posts').get_json()['posts'][0]
    assert _is_utc_aware(post['created_at'])
    assert _is_utc_aware(post['climbed_at'])


def test_fresh_post_reads_as_just_now_not_future(client, db):
    """The '4 hours ago shows just now' bug: a post created now must not
    appear to be in the future when compared against wall-clock UTC."""
    alice = make_user(db, username='alice', email='alice@example.com')
    make_post(db, alice)
    login(client, alice)
    post = client.get('/api/posts').get_json()['posts'][0]
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(post['climbed_at'])).total_seconds()
    assert 0 <= age < 60
