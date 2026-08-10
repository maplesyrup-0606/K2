from datetime import datetime, timezone, timedelta

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from extensions import db
from models import Plan, PlanAttendee, PlanInvite, Gym, Follow, Notification
from helpers import to_utc, plan_payload, prune_notifications

plans_bp = Blueprint('plans', __name__)


@plans_bp.route('/api/plans', methods=['POST'])
@login_required
def create_plan():
    data = request.get_json(silent=True) or {}

    gym_id_raw = data.get('gym_id')
    if gym_id_raw is None:
        return {'error': 'gym_id is required'}, 400
    try:
        gym_id = int(gym_id_raw)
    except (ValueError, TypeError):
        return {'error': 'gym_id must be an integer'}, 400
    gym = db.session.get(Gym, gym_id)
    if gym is None:
        return {'error': 'gym not found'}, 400

    planned_at_str = data.get('planned_at')
    if not planned_at_str:
        return {'error': 'planned_at is required'}, 400
    try:
        planned_at = to_utc(datetime.fromisoformat(planned_at_str))
    except ValueError:
        return {'error': 'planned_at must be ISO 8601'}, 400
    if planned_at < datetime.now(timezone.utc):
        return {'error': 'planned_at must be in the future'}, 400

    note = data.get('note')
    if note is not None:
        note = note.strip()
        if len(note) > 500:
            return {'error': 'note must be at most 500 chars'}, 400
        if note == '':
            note = None

    invite_user_ids = data.get('invite_user_ids') or []
    if not isinstance(invite_user_ids, list):
        return {'error': 'invite_user_ids must be a list'}, 400
    try:
        invite_user_ids = {int(x) for x in invite_user_ids}
    except (ValueError, TypeError):
        return {'error': 'invite_user_ids must be integers'}, 400

    if invite_user_ids:
        followed_ids = {
            row.followed_id for row in Follow.query.filter(
                Follow.follower_id == current_user.id,
                Follow.followed_id.in_(invite_user_ids),
            ).all()
        }
        if followed_ids != invite_user_ids:
            return {'error': 'can only invite people you follow'}, 400

    plan = Plan(
        user_id=current_user.id,
        gym_id=gym_id,
        planned_at=planned_at,
        note=note,
    )

    db.session.add(plan)
    db.session.flush()

    db.session.add(PlanAttendee(
        plan_id=plan.id,
        user_id=current_user.id,
    ))

    for uid in invite_user_ids:
        db.session.add(PlanInvite(plan_id=plan.id, user_id=uid))
        db.session.add(Notification(
            user_id=uid,
            actor_id=current_user.id,
            type='plan_invite',
            plan_id=plan.id,
        ))

    db.session.commit()
    for uid in invite_user_ids:
        prune_notifications(uid)
    return plan_payload(plan), 201

@plans_bp.route('/api/plans', methods=['GET'])
@login_required
def list_plans():
    now = datetime.now(timezone.utc)
    week_out = now + timedelta(days=7)

    plans = (
        Plan.query
        .filter(Plan.planned_at >= now)
        .filter(
            or_(
                Plan.user_id == current_user.id,
                Plan.planned_at <= week_out,
            )
        )
        .order_by(Plan.planned_at.asc())
        .all()
    )

    return {'plans': [plan_payload(p) for p in plans]}

@plans_bp.route('/api/plans/<int:plan_id>/attendees', methods=['POST'])
@login_required
def join_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error': 'plan not found'}, 404

    existing = db.session.get(PlanAttendee, (plan_id, current_user.id))
    if existing is None:
        db.session.add(PlanAttendee(
            plan_id=plan_id,
            user_id=current_user.id,
        ))

        if plan.user_id != current_user.id:
            db.session.add(Notification(
                user_id=plan.user_id,
                actor_id=current_user.id,
                type='plan_join',
                plan_id=plan.id
            ))
        db.session.commit()
        if plan.user_id != current_user.id:
            prune_notifications(plan.user_id)

    return plan_payload(plan), 200

@plans_bp.route('/api/plans/<int:plan_id>/attendees', methods=['DELETE'])
@login_required
def leave_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error': 'plan not found'}, 404

    if plan.user_id == current_user.id:
        return {
            'error': 'organizer cannot leave; delete the plan instead'
        }, 400

    attendee = db.session.get(PlanAttendee, (plan_id, current_user.id))
    if attendee is not None:
        db.session.delete(attendee)
        db.session.commit()

    return plan_payload(plan), 200

@plans_bp.route('/api/plans/<int:plan_id>', methods=['PATCH'])
@login_required
def update_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error' : 'plan not found'}, 404
    if plan.user_id != current_user.id:
        return {'error' : 'not your plan'}, 403

    data = request.get_json(silent=True) or {}

    if 'gym_id' in data:
        try:
            gym_id = int(data['gym_id'])
        except (ValueError, TypeError):
            return {'error': 'gym_id must be an integer'}, 400
        gym = db.session.get(Gym, gym_id)
        if gym is None:
            return {'error': 'gym not found'}, 400
        plan.gym_id = gym_id

    if 'planned_at' in data:
        try:
            planned_at = to_utc(datetime.fromisoformat(data['planned_at']))
        except (ValueError, TypeError):
            return {'error': 'planned_at must be ISO 8601'}, 400
        if planned_at < datetime.now(timezone.utc):
            return {'error': 'planned_at must be in the future'}, 400
        plan.planned_at = planned_at

    if 'note' in data:
        note = data['note']
        if note is not None:
            note = note.strip()
            if len(note) > 500:
                return {'error': 'note must be at most 500 chars'}, 400
            if note == '':
                note = None
        plan.note = note

    db.session.commit()
    return plan_payload(plan)

@plans_bp.route('/api/plans/<int:plan_id>', methods=['DELETE'])
@login_required
def delete_plan(plan_id):
    plan = db.session.get(Plan, plan_id)
    if plan is None:
        return {'error' : 'plan not found'}, 404
    if plan.user_id != current_user.id:
        return {'error' : 'not your plan'}, 403

    PlanAttendee.query.filter_by(plan_id=plan_id).delete()

    db.session.delete(plan)
    db.session.commit()
    return '', 204
