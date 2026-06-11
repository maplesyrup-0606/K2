import pytest
from conftest import make_user, login


def test_media_requires_auth(client, db):
    """Unauthenticated requests to /media/ must not be served."""
    resp = client.get('/media/1/somefile.jpg')
    assert resp.status_code in (401, 302)


def test_media_authenticated_get(client, db, tmp_path, app, monkeypatch):
    """Authenticated users can fetch media files and get cache headers."""
    import app as app_module
    monkeypatch.setattr(app_module, 'MEDIA_DIR', str(tmp_path))

    user = make_user(db, 'mediauser', 'media@example.com')
    user_dir = tmp_path / str(user.id)
    user_dir.mkdir()
    (user_dir / 'test.jpg').write_bytes(b'FAKEJPEG')

    login(client, user)
    resp = client.get(f'/media/{user.id}/test.jpg')
    assert resp.status_code == 200
    assert 'immutable' in resp.headers.get('Cache-Control', '')
