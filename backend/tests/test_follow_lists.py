from datetime import datetime, timezone, timedelta

import pytest

from conftest import make_user, login
from models import Follow


def _follow(db, follower, followed, minutes_ago=0):
    db.session.add(Follow(
        follower_id=follower.id,
        followed_id=followed.id,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
    ))
    db.session.commit()


def _usernames(response):
    return [user['username'] for user in response.get_json()['users']]


@pytest.fixture
def viewer(client, db):
    """A logged-in user with no follow relationships of their own."""
    user = make_user(db, username='viewer', email='viewer@example.com')
    login(client, user)
    return user


@pytest.mark.parametrize('kind', ['followers', 'following'])
def test_lists_require_login(client, db, kind):
    make_user(db, username='bob', email='bob@example.com')
    assert client.get(f'/api/users/bob/{kind}').status_code == 401


@pytest.mark.parametrize('kind', ['followers', 'following'])
def test_lists_unknown_user_404(client, db, viewer, kind):
    assert client.get(f'/api/users/nobody/{kind}').status_code == 404


def test_followers_and_following_are_not_swapped(client, db, viewer):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    carol = make_user(db, username='carol', email='carol@example.com')
    _follow(db, alice, bob)    # alice follows bob
    _follow(db, carol, alice)  # carol follows alice

    # viewed by a third party, so this also proves you can see other people's lists
    assert _usernames(client.get('/api/users/alice/following')) == ['bob']
    assert _usernames(client.get('/api/users/alice/followers')) == ['carol']
    assert _usernames(client.get('/api/users/bob/followers')) == ['alice']
    assert _usernames(client.get('/api/users/bob/following')) == []


def test_list_exposes_only_public_card_fields(client, db, viewer):
    alice = make_user(db, username='alice', email='alice@example.com')
    _follow(db, viewer, alice)

    user = client.get('/api/users/viewer/following').get_json()['users'][0]

    assert set(user) == {'id', 'username', 'display_name', 'avatar_url'}


def test_lists_are_newest_follow_first(client, db, viewer):
    for name, minutes_ago in [('oldest', 30), ('newest', 1), ('middle', 10)]:
        _follow(db, make_user(db, username=name, email=f'{name}@example.com'), viewer, minutes_ago)

    assert _usernames(client.get('/api/users/viewer/followers')) == ['newest', 'middle', 'oldest']


def test_pagination_walks_every_user_once(client, db, viewer):
    for index in range(5):
        _follow(db, make_user(db, username=f'fan{index}', email=f'fan{index}@example.com'), viewer, index)

    first = client.get('/api/users/viewer/followers?limit=2').get_json()
    second = client.get('/api/users/viewer/followers?limit=2&offset=2').get_json()
    third = client.get('/api/users/viewer/followers?limit=2&offset=4').get_json()

    assert [first['next_offset'], second['next_offset'], third['next_offset']] == [2, 4, None]
    walked = [user['username'] for page in (first, second, third) for user in page['users']]
    assert walked == ['fan0', 'fan1', 'fan2', 'fan3', 'fan4']


def test_exact_multiple_of_page_size_has_no_empty_trailing_page(client, db, viewer):
    for index in range(4):
        _follow(db, make_user(db, username=f'fan{index}', email=f'fan{index}@example.com'), viewer, index)

    second = client.get('/api/users/viewer/followers?limit=2&offset=2').get_json()

    assert len(second['users']) == 2
    assert second['next_offset'] is None


def test_limit_is_clamped(client, db, viewer):
    for index in range(51):
        _follow(db, make_user(db, username=f'fan{index}', email=f'fan{index}@example.com'), viewer, index)

    capped = client.get('/api/users/viewer/followers?limit=1000').get_json()
    floored = client.get('/api/users/viewer/followers?limit=0').get_json()

    assert len(capped['users']) == 50 and capped['next_offset'] == 50
    assert len(floored['users']) == 1


def test_non_integer_paging_params_400(client, db, viewer):
    assert client.get('/api/users/viewer/followers?limit=abc').status_code == 400
    assert client.get('/api/users/viewer/following?offset=x').status_code == 400


def test_me_following_route_still_wins_over_the_username_route(client, db, viewer):
    # /api/users/me/following predates these routes (PlanComposer uses it);
    # a literal "me" must keep resolving to it, not to <username>=me.
    alice = make_user(db, username='alice', email='alice@example.com')
    _follow(db, viewer, alice)

    body = client.get('/api/users/me/following').get_json()

    assert [user['username'] for user in body['users']] == ['alice']
    assert 'next_offset' not in body
