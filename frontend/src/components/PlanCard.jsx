import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PlanCard({
  plan,
  currentUserId,
  onChange,
  onEdit,
  onDelete,
}) {
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [attendeesOpen, setAttendeesOpen] = useState(false)

  const isOrganizer = plan.organizer.id === currentUserId
  const isAttending = plan.attendees.some((a) => a.id === currentUserId)

  const attendeeCount = plan.attendees.length
  const previewAttendees = plan.attendees.slice(0, 4)
  const remaining = attendeeCount - previewAttendees.length

  async function handleJoin() {
    if (busy) return
    setBusy(true)
    const { ok, data } = await api.joinPlan(plan.id)
    setBusy(false)
    if (!ok) {
      window.alert(data?.error || 'Failed to join')
      return
    }
    onChange?.(data)
  }

  async function handleLeave() {
    if (busy) return
    setBusy(true)
    const { ok, data } = await api.leavePlan(plan.id)
    setBusy(false)
    if (!ok) {
      window.alert(data?.error || 'Failed to leave')
      return
    }
    onChange?.(data)
  }

  async function handleDeleteClick() {
    setMenuOpen(false)
    if (!window.confirm('Cancel this plan? Everyone will see it disappear.')) {
      return
    }
    onDelete?.(plan)
  }

  return (
    <article className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {plan.organizer.avatar_url && (
          <Link to={`/u/${plan.organizer.username}`} className="shrink-0">
            <img
              src={plan.organizer.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full hover:opacity-80 transition"
            />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm flex-1 min-w-0">
              <Link
                to={`/u/${plan.organizer.username}`}
                className="font-medium text-stone-900 dark:text-stone-100 hover:underline"
              >
                {plan.organizer.display_name}
              </Link>
              <span className="text-stone-500 dark:text-stone-400"> is going to </span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {plan.gym.name}
              </span>
            </div>

            {isOrganizer && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="text-stone-400 dark:text-stone-500 hover:text-stone-700 text-lg px-2 leading-none"
                  aria-label="Plan options"
                >
                  ⋯
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-7 z-20 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-md py-1 min-w-[120px]">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false)
                          onEdit?.(plan)
                        }}
                        className="block w-full text-left px-3 py-1.5 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className="block w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      >
                        Cancel plan
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            {timeLabel(plan.planned_at)}
          </div>

          {plan.note && (
            <p className="mt-2 text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
              {plan.note}
            </p>
          )}

          {/* Attendees + action */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAttendeesOpen((v) => !v)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              <div className="flex -space-x-2 shrink-0">
                {previewAttendees.map((u) =>
                  u.avatar_url ? (
                    <img
                      key={u.id}
                      src={u.avatar_url}
                      alt=""
                      className="w-7 h-7 rounded-full border-2 border-white dark:border-stone-900 bg-stone-100 dark:bg-stone-800"
                    />
                  ) : (
                    <div
                      key={u.id}
                      className="w-7 h-7 rounded-full border-2 border-white dark:border-stone-900 bg-stone-300 dark:bg-stone-600 text-[10px] flex items-center justify-center"
                    >
                      {u.display_name?.[0] ?? '?'}
                    </div>
                  )
                )}
              </div>
              <span className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition">
                {attendeeCount} going
              </span>
            </button>

            {isOrganizer ? (
              <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">
                Hosting
              </span>
            ) : isAttending ? (
              <button
                type="button"
                onClick={handleLeave}
                disabled={busy}
                className="text-xs px-3 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50"
              >
                {busy ? '…' : 'Leave'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                disabled={busy}
                className="text-xs px-3 py-1 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50"
              >
                {busy ? '…' : "I'm in"}
              </button>
            )}
          </div>
          {attendeesOpen && attendeeCount > 0 && (
            <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-col gap-2">
              {plan.attendees.map((u) => (
                <Link
                  key={u.id}
                  to={`/u/${u.username}`}
                  className="flex items-center gap-2 hover:opacity-70 transition"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-stone-300 dark:bg-stone-600 text-[10px] flex items-center justify-center">
                      {u.display_name?.[0] ?? '?'}
                    </div>
                  )}
                  <span className="text-xs text-stone-700 dark:text-stone-300">{u.display_name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
