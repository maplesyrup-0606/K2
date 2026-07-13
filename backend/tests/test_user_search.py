from conftest import make_user, login


def search(client, q):
    res = client.get(f'/api/users?q={q}')
    assert res.status_code == 200
    return [u['username'] for u in res.get_json()['users']]


def test_requires_login(client, db):
    res = client.get('/api/users?q=al')
    assert res.status_code == 401


def test_empty_query_returns_no_one(client, db):
    user = make_user(db)
    login(client, user)
    for q in ('', '   '):
        res = client.get(f'/api/users?q={q}')
        assert res.status_code == 200
        assert res.get_json()['users'] == []


def test_prefix_match(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    make_user(db, username='bob', email='bob@example.com')
    login(client, alice)
    assert search(client, 'ali') == ['alice']


def test_fuzzy_subsequence_match(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    make_user(db, username='bob', email='bob@example.com')
    login(client, alice)
    # 'ace' is a subsequence of 'alice' but not a substring
    assert search(client, 'ace') == ['alice']


def test_matches_display_name(client, db):
    user = make_user(db, username='mmcindoe', email='m@example.com')
    user.display_name = 'Mercury'
    db.session.commit()
    login(client, user)
    assert search(client, 'merc') == ['mmcindoe']


def test_case_insensitive(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)
    assert search(client, 'ALI') == ['alice']


def test_no_match(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    login(client, alice)
    assert search(client, 'zzz') == []


def test_prefix_ranks_above_subsequence(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    # 'al' is also a subsequence of 'natalie' (n-A-t-a-L-ie)
    make_user(db, username='natalie', email='n@example.com')
    login(client, alice)
    results = search(client, 'al')
    assert results[0] == 'alice'
    assert 'natalie' in results


def test_excludes_not_onboarded(client, db):
    alice = make_user(db, username='alice', email='alice@example.com')
    ghost = make_user(db, username='alfred', email='alf@example.com')
    ghost.is_onboarded = False
    db.session.commit()
    login(client, alice)
    assert search(client, 'al') == ['alice']
