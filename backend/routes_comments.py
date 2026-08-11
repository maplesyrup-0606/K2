from datetime import datetime, timezone

from flask import Blueprint, request
from flask_login import current_user, login_required

from extensions import db
from models import Post, Comment, Notification
from helpers import comment_payload, prune_notifications

comments_bp = Blueprint('comments', __name__)


def _validate_body(data):
    body = data.get('body')
    if not isinstance(body, str) or not (1 <= len(body.strip()) <= 500):
        return None, ({'error': 'body must be 1-500 characters'}, 400)
    return body.strip(), None


@comments_bp.route('/api/posts/<int:post_id>/comments', methods=['POST'])
@login_required
def create_comment(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return {'error': 'post not found'}, 404

    data = request.get_json(silent=True) or {}
    body, error = _validate_body(data)
    if error:
        return error

    parent_id = None
    reply_to_user_id = None
    reply_to_comment_id = data.get('reply_to_comment_id')
    if reply_to_comment_id is not None:
        if not isinstance(reply_to_comment_id, int) or isinstance(reply_to_comment_id, bool):
            return {'error': 'reply_to_comment_id must be an integer'}, 400
        target = db.session.get(Comment, reply_to_comment_id)
        if target is None or target.post_id != post.id:
            return {'error': 'comment not found'}, 404
        # Flatten: always attach under the top-level comment, even if the
        # target itself is already a reply — that's what keeps threads one
        # level deep no matter which comment "reply" was tapped on.
        parent_id = target.parent_id if target.parent_id is not None else target.id
        reply_to_user_id = target.user_id

    comment = Comment(
        post_id=post.id,
        user_id=current_user.id,
        parent_id=parent_id,
        reply_to_user_id=reply_to_user_id,
        body=body,
    )
    db.session.add(comment)
    db.session.flush()  # assigns comment.id so the notification below can reference it

    if parent_id is None:
        notify_user_id = post.user_id
        notif_type = 'comment'
    else:
        notify_user_id = reply_to_user_id
        notif_type = 'comment_reply'

    if notify_user_id != current_user.id:
        db.session.add(Notification(
            user_id=notify_user_id,
            actor_id=current_user.id,
            type=notif_type,
            post_id=post.id,
            comment_id=comment.id,
        ))

    db.session.commit()
    if notify_user_id != current_user.id:
        prune_notifications(notify_user_id)

    return comment_payload(comment), 201


@comments_bp.route('/api/posts/<int:post_id>/comments', methods=['GET'])
@login_required
def list_comments(post_id):
    post = db.session.get(Post, post_id)
    if post is None:
        return {'error': 'post not found'}, 404

    all_comments = (
        Comment.query
        .filter_by(post_id=post_id)
        .order_by(Comment.created_at.asc())
        .all()
    )

    replies_by_parent = {}
    top_level = []
    for c in all_comments:
        if c.parent_id is None:
            top_level.append(c)
        else:
            replies_by_parent.setdefault(c.parent_id, []).append(c)

    return {
        'comments': [
            {
                **comment_payload(c),
                'replies': [comment_payload(r) for r in replies_by_parent.get(c.id, [])],
            }
            for c in top_level
        ],
    }


@comments_bp.route('/api/comments/<int:comment_id>', methods=['PATCH'])
@login_required
def update_comment(comment_id):
    comment = db.session.get(Comment, comment_id)
    if comment is None:
        return {'error': 'comment not found'}, 404
    if comment.user_id != current_user.id:
        return {'error': 'not your comment'}, 403

    data = request.get_json(silent=True) or {}
    body, error = _validate_body(data)
    if error:
        return error

    comment.body = body
    comment.edited_at = datetime.now(timezone.utc)
    db.session.commit()

    return comment_payload(comment)


@comments_bp.route('/api/comments/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    comment = db.session.get(Comment, comment_id)
    if comment is None:
        return {'error': 'comment not found'}, 404
    if comment.user_id != current_user.id:
        return {'error': 'not your comment'}, 403

    if comment.parent_id is None:
        Comment.query.filter_by(parent_id=comment.id).delete()

    db.session.delete(comment)
    db.session.commit()

    return '', 204
