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
  const [date, setDate] = useState('')
  const [time, setTime] = useState('18:00')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

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
            <select
              value={gymId}
              onChange={(e) => setGymId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
              required
            >
              {gyms.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* When — separate date and time */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Date
            </label>
            <input
              type="date"
              value={date}
              min={todayLocalDate()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
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
              className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
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
            className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
          />
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
