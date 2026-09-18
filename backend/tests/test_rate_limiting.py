def test_login_rate_limit_enforced(app, client, db):
    # RATELIMIT_ENABLED is False for the rest of the suite (see conftest.py)
    # to avoid cross-test 429s; re-enable it just for this test to prove the
    # limiter is actually wired into the app, not just configured-and-unused.
    app.config['RATELIMIT_ENABLED'] = True
    try:
        last = None
        for _ in range(11):
            last = client.post('/api/auth/login', json={
                'email': 'ratelimit@example.com', 'password': 'wrongpass',
            })
        assert last.status_code == 429
    finally:
        app.config['RATELIMIT_ENABLED'] = False
