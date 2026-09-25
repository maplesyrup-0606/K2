from datetime import datetime, timezone, timedelta

import pytest

import emailer
import routes_invites
from conftest import make_user, login
from models import EmailInvite


@pytest.fixture
def sent(monkeypatch):
    """Captures outgoing invite emails and runs the "background" send inline,
    so tests never touch SMTP or race a real thread."""
    outbox = []
    monkeypatch.setattr(routes_invites, 'run_in_background', lambda func, *args: func(*args))
    monkeypatch.setattr(routes_invites, 'send_invite_email', lambda to, name: outbox.append((to, name)))
    return outbox


def test_invite_requires_login(client, db):
    assert client.post('/api/invites', json={'email': 'friend@example.com'}).status_code == 401


def test_invite_sends_email_and_records_it(client, db, sent):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)

    res = client.post('/api/invites', json={'email': 'friend@example.com'})

    assert res.status_code == 200
    assert res.get_json() == {'sent': True}
    assert sent == [('friend@example.com', 'Alice')]
    row = EmailInvite.query.one()
    assert (row.inviter_id, row.email) == (alice.id, 'friend@example.com')


def test_invite_normalizes_email(client, db, sent):
    login(client, make_user(db, username='alice', email='alice@example.com'))

    client.post('/api/invites', json={'email': '  Friend@Example.COM '})

    assert sent == [('friend@example.com', 'Alice')]
    assert EmailInvite.query.one().email == 'friend@example.com'


@pytest.mark.parametrize('bad_email', [
    '', None, 'not-an-email', 'a@b', '@example.com', 'a b@example.com',
    'a@example.com\nBcc: victim@example.com', 'x' * 250 + '@example.com',
])
def test_invite_rejects_invalid_email(client, db, sent, bad_email):
    login(client, make_user(db, username='alice', email='alice@example.com'))

    res = client.post('/api/invites', json={'email': bad_email})

    assert res.status_code == 400
    assert sent == []
    assert EmailInvite.query.count() == 0


def test_invite_rejects_own_email(client, db, sent):
    login(client, make_user(db, username='alice', email='alice@example.com'))

    res = client.post('/api/invites', json={'email': 'ALICE@example.com'})

    assert res.status_code == 400
    assert sent == []


def test_invite_existing_member_is_a_silent_noop(client, db, sent):
    # Same response as a real send — otherwise this endpoint is an oracle
    # for "does this email have a K2 account".
    make_user(db, username='bob', email='bob@example.com')
    login(client, make_user(db, username='alice', email='alice@example.com'))

    res = client.post('/api/invites', json={'email': 'bob@example.com'})

    assert res.status_code == 200
    assert res.get_json() == {'sent': True}
    assert sent == []
    assert EmailInvite.query.count() == 0


def test_invite_repeat_within_cooldown_sends_once(client, db, sent):
    login(client, make_user(db, username='alice', email='alice@example.com'))

    first = client.post('/api/invites', json={'email': 'friend@example.com'})
    second = client.post('/api/invites', json={'email': 'friend@example.com'})

    assert first.status_code == second.status_code == 200
    assert len(sent) == 1
    assert EmailInvite.query.count() == 1


def test_invite_can_resend_after_cooldown(client, db, sent):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)
    db.session.add(EmailInvite(
        inviter_id=alice.id, email='friend@example.com',
        created_at=datetime.now(timezone.utc) - routes_invites.RESEND_COOLDOWN - timedelta(minutes=1),
    ))
    db.session.commit()

    res = client.post('/api/invites', json={'email': 'friend@example.com'})

    assert res.status_code == 200
    assert len(sent) == 1


def test_invite_daily_cap(client, db, sent):
    login(client, make_user(db, username='alice', email='alice@example.com'))

    for i in range(routes_invites.INVITES_PER_DAY):
        assert client.post('/api/invites', json={'email': f'friend{i}@example.com'}).status_code == 200
    over = client.post('/api/invites', json={'email': 'onetoomany@example.com'})

    assert over.status_code == 429
    assert len(sent) == routes_invites.INVITES_PER_DAY


def test_invite_daily_cap_is_per_user_and_expires(client, db, sent):
    alice = make_user(db, username='alice', email='alice@example.com')
    bob = make_user(db, username='bob', email='bob@example.com')
    old = datetime.now(timezone.utc) - timedelta(days=1, minutes=1)
    for i in range(routes_invites.INVITES_PER_DAY):
        db.session.add(EmailInvite(inviter_id=alice.id, email=f'old{i}@example.com', created_at=old))
        db.session.add(EmailInvite(inviter_id=bob.id, email=f'bobs{i}@example.com'))
    db.session.commit()

    login(client, alice)
    assert client.post('/api/invites', json={'email': 'new@example.com'}).status_code == 200

    login(client, bob)
    assert client.post('/api/invites', json={'email': 'new2@example.com'}).status_code == 429


def test_invite_email_escapes_and_sanitizes_inviter_name(monkeypatch):
    captured = {}
    monkeypatch.setattr(emailer, 'send_email', lambda to, subject, html: captured.update(to=to, subject=subject, html=html))

    emailer.send_invite_email('friend@example.com', 'Eve\nBcc: victim@example.com <script>alert(1)</script>')

    assert '\n' not in captured['subject']
    assert '<script>' not in captured['html']
    assert '&lt;script&gt;' in captured['html']
    assert captured['to'] == 'friend@example.com'
