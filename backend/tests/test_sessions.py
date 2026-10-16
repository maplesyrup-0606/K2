import io
from datetime import date, datetime, timezone

from PIL import Image

from conftest import make_user, login
from models import Post, Follow, Gym, SessionCover


def make_post(db, user, day='2026-10-14', scale='v', grade=3, outcome='sent',
              attempts='1', hour=18, gym_id=None):
    climbed_at = datetime(2026, 10, int(day[-2:]), hour, tzinfo=timezone.utc)
    post = Post(
        user_id=user.id,
        climbed_at=climbed_at,
        climbed_on=date.fromisoformat(day),
        grade_scale=scale,
        grade_value=grade,
        outcome=outcome,
        attempts_bucket=attempts,
        photo_path=f'{user.id}/fake.jpg',
        gym_id=gym_id,
    )
    db.session.add(post)
    db.session.commit()
    return post


def test_posts_on_one_day_form_one_session(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    make_post(db, alice, '2026-10-14', grade=3)
    make_post(db, alice, '2026-10-14', grade=5, hour=19)
    make_post(db, alice, '2026-10-12', grade=2)

    login(client, alice)
    data = client.get('/api/users/alice/sessions').get_json()

    assert data['total'] == 2
    assert [s['date'] for s in data['sessions']] == ['2026-10-14', '2026-10-12']
    assert data['sessions'][0]['climb_count'] == 2


def test_hardest_sent_ignores_projecting_and_ranks_v_over_comp(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    make_post(db, alice, grade=7, outcome='projecting', attempts='5-9')
    make_post(db, alice, grade=4, outcome='sent', attempts='2')
    make_post(db, alice, scale='comp', grade=4, outcome='sent')

    login(client, alice)
    session = client.get('/api/users/alice/sessions').get_json()['sessions'][0]

    assert session['hardest_sent']['grade_scale'] == 'v'
    assert session['hardest_sent']['grade_value'] == 4
    assert session['send_count'] == 2


def test_hardest_sent_tie_prefers_fewer_attempts(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    slow = make_post(db, alice, grade=5, attempts='5-9')
    fast = make_post(db, alice, grade=5, attempts='2')

    login(client, alice)
    session = client.get('/api/users/alice/sessions').get_json()['sessions'][0]

    assert session['hardest_sent']['post_id'] == fast.id
    assert session['hardest_sent']['post_id'] != slow.id


def test_default_cover_is_highest_grade_even_if_not_sent(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    make_post(db, alice, grade=4, outcome='sent')
    hardest = make_post(db, alice, grade=8, outcome='gave_up', attempts='10+')

    login(client, alice)
    session = client.get('/api/users/alice/sessions').get_json()['sessions'][0]

    assert session['cover'] == {
        'post_id': hardest.id,
        'photo_path': hardest.photo_path,
        'is_chosen': False,
    }


def test_preview_photos_skip_the_cover_and_cap_at_four(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    cover = make_post(db, alice, grade=9)
    others = [make_post(db, alice, grade=2, hour=10 + i) for i in range(6)]

    login(client, alice)
    session = client.get('/api/users/alice/sessions').get_json()['sessions'][0]

    assert session['cover']['post_id'] == cover.id
    assert len(session['preview_photos']) == 4
    assert session['climb_count'] == len(others) + 1


def test_day_with_no_sends_still_has_a_headline(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    make_post(db, alice, grade=6, outcome='projecting', attempts='3-4')

    login(client, alice)
    session = client.get('/api/users/alice/sessions').get_json()['sessions'][0]

    assert session['hardest_sent'] is None
    assert session['headline']['grade_value'] == 6
    assert session['headline']['outcome'] == 'projecting'


def test_user_can_choose_and_reset_cover(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    easy = make_post(db, alice, grade=2)
    make_post(db, alice, grade=6)

    login(client, alice)
    resp = client.put('/api/users/me/sessions/2026-10-14/cover', json={'post_id': easy.id})
    assert resp.status_code == 204

    cover = client.get('/api/users/alice/sessions').get_json()['sessions'][0]['cover']
    assert cover['post_id'] == easy.id
    assert cover['is_chosen'] is True

    client.put('/api/users/me/sessions/2026-10-14/cover', json={'post_id': None})
    cover = client.get('/api/users/alice/sessions').get_json()['sessions'][0]['cover']
    assert cover['is_chosen'] is False


def test_cover_must_be_own_post_from_that_day(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    make_post(db, alice, '2026-10-14')
    other_day = make_post(db, alice, '2026-10-12')
    bobs = make_post(db, bob, '2026-10-14')

    login(client, alice)
    for bad_id in (other_day.id, bobs.id, 9999):
        resp = client.put('/api/users/me/sessions/2026-10-14/cover', json={'post_id': bad_id})
        assert resp.status_code == 400
    assert SessionCover.query.count() == 0


def test_deleting_the_cover_post_clears_the_pick(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    picked = make_post(db, alice, grade=2)
    make_post(db, alice, grade=6)

    login(client, alice)
    client.put('/api/users/me/sessions/2026-10-14/cover', json={'post_id': picked.id})
    assert client.delete(f'/api/posts/{picked.id}').status_code == 204

    assert SessionCover.query.count() == 0
    cover = client.get('/api/users/alice/sessions').get_json()['sessions'][0]['cover']
    assert cover['is_chosen'] is False


def test_session_detail_lists_posts_in_logged_order(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    later = make_post(db, alice, grade=5, hour=20)
    earlier = make_post(db, alice, grade=3, hour=17)

    login(client, alice)
    data = client.get('/api/users/alice/sessions/2026-10-14').get_json()

    assert [p['id'] for p in data['posts']] == [earlier.id, later.id]
    assert data['climb_count'] == 2


def test_session_detail_404_and_bad_date(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    login(client, alice)

    assert client.get('/api/users/alice/sessions/2026-10-14').status_code == 404
    assert client.get('/api/users/alice/sessions/not-a-date').status_code == 400
    assert client.get('/api/users/nobody/sessions').status_code == 404


def test_feed_sessions_following_scope(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    bob = make_user(db, 'bob', 'bob@example.com')
    carol = make_user(db, 'carol', 'carol@example.com')
    make_post(db, alice)
    make_post(db, bob)
    make_post(db, carol)
    db.session.add(Follow(follower_id=alice.id, followed_id=bob.id))
    db.session.commit()

    login(client, alice)
    everyone = client.get('/api/sessions').get_json()['sessions']
    following = client.get('/api/sessions?feed=following').get_json()['sessions']

    assert len(everyone) == 3
    assert {s['user']['username'] for s in following} == {'alice', 'bob'}
    assert client.get('/api/sessions?feed=nope').status_code == 400


def test_feed_sessions_paginates(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    for day in ('2026-10-10', '2026-10-11', '2026-10-12'):
        make_post(db, alice, day)

    login(client, alice)
    first = client.get('/api/sessions?limit=2').get_json()
    assert [s['date'] for s in first['sessions']] == ['2026-10-12', '2026-10-11']
    assert first['next_offset'] == 2

    second = client.get('/api/sessions?limit=2&offset=2').get_json()
    assert [s['date'] for s in second['sessions']] == ['2026-10-10']
    assert second['next_offset'] is None


def test_sessions_require_login(client, db):
    assert client.get('/api/sessions').status_code == 401
    assert client.get('/api/users/alice/sessions').status_code == 401


def test_update_me_timezone_validated(client, db):
    alice = make_user(db, 'alice', 'alice@example.com')
    login(client, alice)

    ok = client.patch('/api/users/me', json={'timezone': 'America/Toronto'})
    assert ok.status_code == 200
    assert ok.get_json()['timezone'] == 'America/Toronto'

    bad = client.patch('/api/users/me', json={'timezone': 'Mars/Olympus'})
    assert bad.status_code == 400


def test_new_post_day_uses_posters_timezone(client, db):
    """7pm in Vancouver is already the next UTC day; the session must stay on
    the local day the climber actually climbed."""
    alice = make_user(db, 'alice', 'alice@example.com')
    gym = Gym(name='Birdcoop')
    db.session.add(gym)
    db.session.commit()
    login(client, alice)

    buffer = io.BytesIO()
    Image.new('RGB', (10, 10)).save(buffer, format='JPEG')
    buffer.seek(0)
    resp = client.post('/api/posts', data={
        'grade_scale': 'v', 'grade_value': '4', 'outcome': 'sent',
        'attempts_bucket': '2', 'hold_color': '#112233', 'gym_id': str(gym.id),
        'climbed_at': '2026-10-15T02:00:00+00:00',
        'timezone': 'America/Vancouver',
        'photo': (buffer, 'p.jpg', 'image/jpeg'),
    }, content_type='multipart/form-data')

    assert resp.status_code == 201
    assert resp.get_json()['climbed_on'] == '2026-10-14'
