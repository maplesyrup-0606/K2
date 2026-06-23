import { useState, useEffect } from 'react'
import { api } from '../api'

const HOLD_COLORS = [
  { hex: '#EF4444', name: 'Red' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EAB308', name: 'Yellow' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#1C1917', name: 'Black' },
  { hex: '#F5F5F4', name: 'White' },
  { hex: '#6B7280', name: 'Gray' },
]

const OUTCOMES = [
  ['sent', 'Sent'],
  ['projecting', 'Project-ing'],
  ['gave_up', 'Gave up'],
]

const ATTEMPTS = ['1', '2', '3-4', '5-9', '10+']

export default function EditPostModal({ post, onClose, onUpdated }) {
  const [gradeScale, setGradeScale] = useState(post.grade_scale)
  const [gradeValue, setGradeValue] = useState(post.grade_value)
  const [outcome, setOutcome] = useState(post.outcome)
  const [attempts, setAttempts] = useState(post.attempts_bucket)
  const [notes, setNotes] = useState(post.notes || '')
  const [holdColor, setHoldColor] = useState(post.hold_color || null)
  const [gyms, setGyms] = useState([])
  const [gymId, setGymId] = useState(post.gym ? String(post.gym.id) : '')
  const [gymOpen, setGymOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.listGyms().then(({ ok, data }) => {
      if (cancelled) return
      const list = ok ? data.gyms : []
      setGyms(list)
      if (!gymId && list.length > 0) setGymId(String(list[0].id))
    })
    return () => { cancelled = true }
  }, [])

  const gradeMin = gradeScale === 'v' ? 0 : 1
  const gradeMax = gradeScale === 'v' ? 9 : 4

  function handleScaleChange(scale) {
    setGradeScale(scale)
    const min = scale === 'v' ? 0 : 1
    const max = scale === 'v' ? 9 : 4
    if (gradeValue < min) setGradeValue(min)
    if (gradeValue > max) setGradeValue(max)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    if (!gymId) {
      setError('Pick a gym')
      setSubmitting(false)
      return
    }

    const body = {
      grade_scale: gradeScale,
      grade_value: gradeValue,
      outcome,
      attempts_bucket: attempts,
      notes: notes.trim() || null,
      hold_color: holdColor,
      gym_id: Number(gymId),
    }

    const { ok, data } = await api.updatePost(post.id, body)
    setSubmitting(false)

    if (!ok) {
      setError(data?.error || 'Failed to update')
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
          <h2 className="text-xl font-semibold">Edit post</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Photo preview (not editable) */}
        <div className="aspect-square w-full bg-stone-100 dark:bg-stone-800 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800">
          <img
            src={`${api.baseUrl}/media/${post.photo_path}`}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-xs text-stone-400 dark:text-stone-500 mt-1 text-center">
          Photo can't be changed
        </div>

        {/* Grade */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Grade
          </label>
          <div className="mt-1 flex gap-2 items-center">
            {[
              ['v', 'V'],
              ['comp', 'Comp'],
            ].map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => handleScaleChange(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  gradeScale === s
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
            <input
              type="number"
              min={gradeMin}
              max={gradeMax}
              value={gradeValue}
              onChange={(e) => {
                const n = parseInt(e.target.value)
                setGradeValue(Number.isNaN(n) ? gradeMin : n)
              }}
              className="w-16 ml-2 px-2 py-1.5 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
            <span className="text-sm text-stone-500 dark:text-stone-400">
              ({gradeMin}–{gradeMax})
            </span>
          </div>
        </div>

        {/* Hold color */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Hold color{' '}
            {!post.hold_color && <span className="text-stone-400 dark:text-stone-500">(optional)</span>}
          </label>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {HOLD_COLORS.map(({ hex, name }) => (
              <button
                key={hex}
                type="button"
                onClick={() => setHoldColor(holdColor === hex ? null : hex)}
                aria-label={name}
                className={`w-8 h-8 rounded-full transition ${holdColor === hex ? 'ring-2 ring-offset-2 ring-stone-900 dark:ring-stone-100' : 'hover:scale-110'}`}
                style={{
                  backgroundColor: hex,
                  border: hex === '#F5F5F4' ? '1px solid #d6d3d1' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Outcome */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Outcome
          </label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {OUTCOMES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setOutcome(v)}
                className={`px-2 py-1.5 rounded-lg text-sm font-medium transition ${
                  outcome === v
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Attempts */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Attempts
          </label>
          <div className="mt-1 grid grid-cols-5 gap-2">
            {ATTEMPTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAttempts(a)}
                className={`px-2 py-1.5 rounded-lg text-sm font-medium transition ${
                  attempts === a
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Gym */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Gym
          </label>
          {gyms.length === 0 ? (
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

        {/* Notes */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Notes <span className="text-stone-400 dark:text-stone-500">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Beta, thoughts, etc."
            className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
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
