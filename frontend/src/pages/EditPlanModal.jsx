import { useEffect, useState } from 'react'
import { api } from '../api'

// Today in local YYYY-MM-DD
function todayLocalDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Convert an ISO datetime string to local "YYYY-MM-DD" and "HH:MM"
function splitLocal(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { date, time }
}

export default function EditPlanModal({ plan, onClose, onUpdated }) {
  const initial = splitLocal(plan.planned_at)
  const [gyms, setGyms] = useState([])
  const [loadingGyms, setLoadingGyms] = useState(true)
  const [gymId, setGymId] = useState(String(plan.gym.id))
  const [gymOpen, setGymOpen] = useState(false)
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [note, setNote] = useState(plan.note || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.listGyms().then(({ ok, data }) => {
      if (cancelled) return
      setGyms(ok ? data.gyms : [])
      setLoadingGyms(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!gymId || !date || !time) {
      setError('All fields except note are required')
      return
    }
    setError(null)
    setSubmitting(true)

    const combined = new Date(`${date}T${time}`)
    if (Number.isNaN(combined.getTime())) {
      setSubmitting(false)
      setError('Invalid date or time')
      return
    }

    const { ok, data } = await api.updatePlan(plan.id, {
      gym_id: Number(gymId),
      planned_at: combined.toISOString(),
      note: note.trim() || null,
    })
    setSubmitting(false)

    if (!ok) {
      setError(data?.error || 'Failed to update plan')
      return
    }

    onUpdated(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl max-w-md w-full p-6 max-h-[100vh] sm:max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Edit plan</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Where
          </label>
          {loadingGyms ? (
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Loading gyms…</div>
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

        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Note <span className="text-stone-400 dark:text-stone-500">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-stone-900"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
