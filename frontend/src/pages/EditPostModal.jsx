import { useState } from 'react'
import { api } from '../api'

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

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

    const body = {
      grade_scale: gradeScale,
      grade_value: gradeValue,
      outcome,
      attempts_bucket: attempts,
      notes: notes.trim() || null,
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Edit post</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Photo preview (not editable) */}
        <div className="aspect-square w-full bg-stone-100 rounded-xl overflow-hidden border border-stone-200">
          <img
            src={`${api.baseUrl}/media/${post.photo_path}`}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-xs text-stone-400 mt-1 text-center">
          Photo can't be changed
        </div>

        {/* Grade */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700">
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
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
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
              className="w-16 ml-2 px-2 py-1.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
            <span className="text-sm text-stone-500">
              ({gradeMin}–{gradeMax})
            </span>
          </div>
        </div>

        {/* Outcome */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700">
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
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Attempts */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700">
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
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700">
            Notes <span className="text-stone-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Beta, thoughts, etc."
            className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full bg-stone-900 text-white rounded-lg px-4 py-2 font-medium hover:bg-stone-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
