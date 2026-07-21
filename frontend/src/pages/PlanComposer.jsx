import { useEffect, useState } from 'react'
import { api } from '../api'

// "YYYY-MM-DD" for today (local). Used as the min for the date input.
function todayLocalDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function PlanComposer({ onClose, onCreated }) {
  const [gyms, setGyms] = useState([])
  const [loadingGyms, setLoadingGyms] = useState(true)
  const [gymId, setGymId] = useState('')
  const [gymOpen, setGymOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('18:00')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [following, setFollowing] = useState([])
  const [loadingFollowing, setLoadingFollowing] = useState(true)
  const [inviteIds, setInviteIds] = useState(new Set())
  const [inviteQuery, setInviteQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    api.listGyms().then(({ ok, data }) => {
      if (cancelled) return
      const list = ok ? data.gyms : []
      setGyms(list)
      if (list.length > 0) setGymId(String(list[0].id))
      setLoadingGyms(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.listFollowing().then(({ ok, data }) => {
      if (cancelled) return
      setFollowing(ok ? data.users : [])
      setLoadingFollowing(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleInvite(id) {
    setInviteIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const normalizedInviteQuery = inviteQuery.trim().toLowerCase()
  const visibleFollowing = normalizedInviteQuery
    ? following.filter(
        (u) =>
          u.username.toLowerCase().includes(normalizedInviteQuery) ||
          u.display_name.toLowerCase().includes(normalizedInviteQuery)
      )
    : following

  async function handleSubmit(e) {
    e.preventDefault()
    if (!gymId) {
      setError('Pick a gym')
      return
    }
    if (!date || !time) {
      setError('Pick a date and time')
      return
    }
    setError(null)
    setSubmitting(true)

    // Combine the local date + time, then convert to a real UTC ISO string.
    const combined = new Date(`${date}T${time}`)
    if (Number.isNaN(combined.getTime())) {
      setSubmitting(false)
      setError('Invalid date or time')
      return
    }
    const isoWithTz = combined.toISOString()

    const { ok, data } = await api.createPlan({
      gym_id: Number(gymId),
      planned_at: isoWithTz,
      note: note.trim() || undefined,
      invite_user_ids: Array.from(inviteIds),
    })
    setSubmitting(false)

    if (!ok) {
      setError(data?.error || 'Failed to create plan')
      return
    }

    onCreated(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl max-w-md w-full p-6 max-h-[100vh] sm:max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">New plan</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Gym */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Where
          </label>
          {loadingGyms ? (
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Loading gyms…</div>
          ) : gyms.length === 0 ? (
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">
              No gyms yet — ask an admin to add one.
            </div>
          ) : (
            <div className="mt-1 relative">
              <button
                type="button"
                onClick={() => setGymOpen((v) => !v)}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white dark:bg-stone-900"
              >
                {(() => {
                  const sel = gyms.find((g) => String(g.id) === gymId)
                  return sel ? (
                    <>
                      <div className="text-sm text-stone-900 dark:text-stone-100">{sel.name}</div>
                      {sel.city && (
                        <div className="text-xs text-stone-400 dark:text-stone-500">
                          {sel.city}{sel.country ? `, ${sel.country}` : ''}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-stone-400 dark:text-stone-500">Select a gym</div>
                  )
                })()}
              </button>
              {gymOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setGymOpen(false)} />
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {gyms.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => { setGymId(String(g.id)); setGymOpen(false) }}
                        className={`w-full px-3 py-2 text-left hover:bg-stone-50 dark:hover:bg-stone-800 ${String(g.id) === gymId ? 'bg-stone-50 dark:bg-stone-800' : ''}`}
                      >
                        <div className="text-sm text-stone-900 dark:text-stone-100">{g.name}</div>
                        {g.city && (
                          <div className="text-xs text-stone-400 dark:text-stone-500">
                            {g.city}{g.country ? `, ${g.country}` : ''}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* When — stacked so date/time pickers don't crowd on mobile */}
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Date
            </label>
            <input
              type="date"
              value={date}
              min={todayLocalDate()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-stone-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-stone-900"
              required
            />
          </div>
        </div>

        {/* Note */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Note <span className="text-stone-400 dark:text-stone-500">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="anything you want to add"
            className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-stone-900"
          />
        </div>

        {/* Invite */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Invite <span className="text-stone-400 dark:text-stone-500">(optional)</span>
          </label>
          {loadingFollowing ? (
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Loading…</div>
          ) : following.length === 0 ? (
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">
              Follow people to invite them to plans.
            </div>
          ) : (
            <div className="mt-1">
              {following.length > 6 && (
                <input
                  type="text"
                  value={inviteQuery}
                  onChange={(e) => setInviteQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full px-3 py-2 mb-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white dark:bg-stone-900"
                />
              )}
              <div className="max-h-40 overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-lg divide-y divide-stone-100 dark:divide-stone-800">
                {visibleFollowing.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-stone-400 dark:text-stone-500">
                    No matches.
                  </div>
                ) : (
                  visibleFollowing.map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={inviteIds.has(user.id)}
                        onChange={() => toggleInvite(user.id)}
                        className="shrink-0"
                      />
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 shrink-0 flex items-center justify-center text-[10px]">
                          {user.display_name?.[0] ?? '?'}
                        </div>
                      )}
                      <span className="text-sm text-stone-900 dark:text-stone-100 truncate">
                        {user.display_name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || gyms.length === 0}
          className="mt-5 w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Post plan'}
        </button>
      </form>
    </div>
  )
}
