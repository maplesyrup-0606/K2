import pytest

from conftest import make_user, login
from models import User


def _add(client, identifier):
    return client.post('/api/admin/admins', json={'identifier': identifier})


@pytest.fixture
def admin_client(client, db):
    login(client, make_user(db, username='root', email='root@example.com', is_admin=True))
    return client


def test_endpoints_require_admin(client, db):
    assert client.get('/api/admin/admins').status_code == 401
    assert _add(client, 'bob').status_code == 401

    login(client, make_user(db, username='alice', email='alice@example.com'))
    assert client.get('/api/admin/admins').status_code == 403
    assert _add(client, 'alice').status_code == 403
    assert User.query.filter_by(username='alice').one().is_admin is False


def test_list_admins_returns_only_admins(admin_client, db):
    make_user(db, username='bob', email='bob@example.com')

    admins = admin_client.get('/api/admin/admins').get_json()['admins']

    assert [admin['username'] for admin in admins] == ['root']


@pytest.mark.parametrize('identifier_for', [
    lambda user: user.email,
    lambda user: user.email.upper(),
    lambda user: user.username,
    lambda user: user.username.upper(),
    lambda user: f'@{user.username}',
    lambda user: str(user.id),
    lambda user: f'  {user.email}  ',
])
def test_add_admin_by_email_username_or_id(admin_client, db, identifier_for):
    bob = make_user(db, username='bob', email='bob@example.com')

    res = _add(admin_client, identifier_for(bob))

    assert res.status_code == 201
    assert res.get_json()['username'] == 'bob'
    assert res.get_json()['is_admin'] is True
    assert db.session.get(User, bob.id).is_admin is True


def test_add_admin_shows_up_in_list(admin_client, db):
    make_user(db, username='bob', email='bob@example.com')

    _add(admin_client, 'bob')

    admins = admin_client.get('/api/admin/admins').get_json()['admins']
    assert [admin['username'] for admin in admins] == ['root', 'bob']


@pytest.mark.parametrize('identifier', ['nobody', 'nobody@example.com', '@nobody', '99999'])
def test_add_admin_unknown_user_404(admin_client, db, identifier):
    res = _add(admin_client, identifier)

    assert res.status_code == 404
    assert User.query.filter_by(is_admin=True).count() == 1


@pytest.mark.parametrize('identifier', ['', '   ', None, 'x' * 256])
def test_add_admin_rejects_bad_input(admin_client, db, identifier):
    assert _add(admin_client, identifier).status_code == 400


def test_add_admin_already_admin_409(admin_client, db):
    make_user(db, username='bob', email='bob@example.com', is_admin=True)

    res = _add(admin_client, 'bob')

    assert res.status_code == 409
    assert 'already an admin' in res.get_json()['error']


def test_add_admin_refuses_unverified_email(admin_client, db):
    # Signup lets a later registrant overwrite an unverified account, so
    # promoting one could hand admin to whoever completes that signup.
    bob = make_user(db, username='bob', email='bob@example.com', password='hunter22', email_verified=False)

    res = _add(admin_client, 'bob@example.com')

    assert res.status_code == 409
    assert 'verified' in res.get_json()['error']
    assert db.session.get(User, bob.id).is_admin is False


def test_numeric_username_wins_over_id(admin_client, db):
    # "123" is both a valid username and someone else's id — the username
    # match takes priority, so the result is never a surprise promotion by id.
    make_user(db, username='other', email='other@example.com')
    target = make_user(db, username='123', email='num@example.com')

    res = _add(admin_client, '123')

    assert res.status_code == 201
    assert res.get_json()['id'] == target.id
