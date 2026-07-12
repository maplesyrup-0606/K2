import io

import pytest
from PIL import Image
from conftest import make_user, login

from models import Gym, Post, Project


def make_gym(db, name='Test Gym'):
    gym = Gym(name=name)
    db.session.add(gym)
    db.session.commit()
    return gym


def make_project(db, user, title='Proj', status='active'):
    project = Project(
        user_id=user.id,
        title=title,
        photo_path=f'{user.id}/proj.jpg',
        grade_scale='v',
        grade_value=4,
        status=status,
    )
    db.session.add(project)
    db.session.commit()
    return project


def make_post(db, user, project=None, outcome='projecting'):
    post = Post(
        user_id=user.id,
        grade_scale='v',
        grade_value=4,
        outcome=outcome,
        attempts_bucket='2',
        photo_path=f'{user.id}/post.jpg',
        hold_color='#ff0000',
        project_id=project.id if project else None,
    )
    db.session.add(post)
    db.session.commit()
    return post


def fake_photo():
    buf = io.BytesIO()
    Image.new('RGB', (10, 10), 'red').save(buf, format='JPEG')
    buf.seek(0)
    return buf


def post_form(gym, project=None, outcome='sent'):
    form = {
        'grade_scale': 'v',
        'grade_value': '4',
        'outcome': outcome,
        'attempts_bucket': '2',
        'hold_color': '#ff0000',
        'gym_id': str(gym.id),
        'photo': (fake_photo(), 'photo.jpg'),
    }
    if project is not None:
        form['project_id'] = str(project.id)
    return form


@pytest.fixture
def media_dir(tmp_path, monkeypatch):
    import app as app_module
    monkeypatch.setattr(app_module, 'MEDIA_DIR', str(tmp_path))
    return tmp_path


def test_sent_post_closes_project(client, db, media_dir):
    user = make_user(db)
    gym = make_gym(db)
    project = make_project(db, user)
    login(client, user)

    resp = client.post(
        '/api/posts',
        data=post_form(gym, project, outcome='sent'),
        content_type='multipart/form-data',
    )
    assert resp.status_code == 201

    db.session.refresh(project)
    assert project.status == 'sent'
    assert project.closed_at is not None


def test_gave_up_post_abandons_project(client, db, media_dir):
    user = make_user(db)
    gym = make_gym(db)
    project = make_project(db, user)
    login(client, user)

    resp = client.post(
        '/api/posts',
        data=post_form(gym, project, outcome='gave_up'),
        content_type='multipart/form-data',
    )
    assert resp.status_code == 201

    db.session.refresh(project)
    assert project.status == 'abandoned'
    assert project.closed_at is not None


def test_projecting_post_keeps_project_active(client, db, media_dir):
    user = make_user(db)
    gym = make_gym(db)
    project = make_project(db, user)
    login(client, user)

    resp = client.post(
        '/api/posts',
        data=post_form(gym, project, outcome='projecting'),
        content_type='multipart/form-data',
    )
    assert resp.status_code == 201

    db.session.refresh(project)
    assert project.status == 'active'
    assert project.closed_at is None


def test_sent_post_without_project_is_fine(client, db, media_dir):
    user = make_user(db)
    gym = make_gym(db)
    login(client, user)

    resp = client.post(
        '/api/posts',
        data=post_form(gym, outcome='sent'),
        content_type='multipart/form-data',
    )
    assert resp.status_code == 201


def test_edit_outcome_to_sent_closes_project(client, db):
    user = make_user(db)
    project = make_project(db, user)
    post = make_post(db, user, project, outcome='projecting')
    login(client, user)

    resp = client.patch(f'/api/posts/{post.id}', json={'outcome': 'sent'})
    assert resp.status_code == 200

    db.session.refresh(project)
    assert project.status == 'sent'
    assert project.closed_at is not None


def test_edit_does_not_reopen_closed_project(client, db):
    user = make_user(db)
    project = make_project(db, user, status='sent')
    post = make_post(db, user, project, outcome='sent')
    login(client, user)

    resp = client.patch(f'/api/posts/{post.id}', json={'outcome': 'projecting'})
    assert resp.status_code == 200

    db.session.refresh(project)
    assert project.status == 'sent'


def test_profile_project_filter_returns_closed_project(client, db, media_dir):
    user = make_user(db)
    gym = make_gym(db)
    project = make_project(db, user)
    login(client, user)

    resp = client.post(
        '/api/posts',
        data=post_form(gym, project, outcome='sent'),
        content_type='multipart/form-data',
    )
    assert resp.status_code == 201

    resp = client.get(f'/api/users/{user.username}/projects?status=sent')
    assert resp.status_code == 200
    assert [p['id'] for p in resp.get_json()['projects']] == [project.id]

    resp = client.get(f'/api/users/{user.username}/projects?status=active')
    assert resp.status_code == 200
    assert resp.get_json()['projects'] == []
