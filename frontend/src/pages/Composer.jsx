import { useState, useEffect } from 'react'
import { api } from '../api'

const OUTCOMES = [
  ['sent', 'Sent'],
  ['projecting', 'Project-ing'],
  ['gave_up', 'Gave up'],
]

const ATTEMPTS = ['1', '2', '3-4', '5-9', '10+']

export default function Composer({ user, onClose, onPosted }) {
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [gradeScale, setGradeScale] = useState('v')
  const [gradeValue, setGradeValue] = useState(0)
  const [outcome, setOutcome] = useState('sent')
  const [attempts, setAttempts] = useState('1')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Project linking state — only used when outcome === 'projecting'
  // projectSelection: null = no link, 'new' = create new project, number = link to existing
  const [projectSelection, setProjectSelection] = useState(null)
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [activeProjects, setActiveProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  const gradeMin = gradeScale === 'v' ? 0 : 1
  const gradeMax = gradeScale === 'v' ? 9 : 4

  // Fetch the user's active projects once when the composer opens
  useEffect(() => {
    if (!user?.username) return
    let cancelled = false
    setLoadingProjects(true)
    api.listUserProjects(user.username, 'active').then(({ ok, data }) => {
      if (cancelled) return
      if (ok) setActiveProjects(data.projects)
      setLoadingProjects(false)
    })
    return () => {
      cancelled = true
    }
  }, [user?.username])

  function handleScaleChange(scale) {
    setGradeScale(scale)
    const min = scale === 'v' ? 0 : 1
    const max = scale === 'v' ? 9 : 4
    if (gradeValue < min) setGradeValue(min)
    if (gradeValue > max) setGradeValue(max)
    // Selected project may no longer match the new grade — clear it
    setProjectSelection(null)
  }

  function handlePhotoChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setPhoto(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  // Show only projects at the current grade
  const matchingProjects = activeProjects.filter(
    (p) => p.grade_scale === gradeScale && p.grade_value === gradeValue
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!photo) {
      setError('Photo is required')
      return
    }
    if (projectSelection === 'new' && !newProjectTitle.trim()) {
      setError('Project title required')
      return
    }

    setError(null)
    setSubmitting(true)

    let projectId = null

    // If creating a new project, do that first so we get its id
    if (projectSelection === 'new') {
      const projectFd = new FormData()
      projectFd.append('title', newProjectTitle.trim())
      projectFd.append('grade_scale', gradeScale)
      projectFd.append('grade_value', String(gradeValue))
      projectFd.append('photo', photo)

      const res = await api.createProject(projectFd)
      if (!res.ok) {
        setSubmitting(false)
        setError(res.data?.error || 'Failed to create project')
        return
      }
      projectId = res.data.id
    } else if (typeof projectSelection === 'number') {
      projectId = projectSelection
    }

    // Create the post itself
    const fd = new FormData()
    fd.append('photo', photo)
    fd.append('grade_scale', gradeScale)
    fd.append('grade_value', String(gradeValue))
    fd.append('outcome', outcome)
    fd.append('attempts_bucket', attempts)
    if (notes.trim()) fd.append('notes', notes.trim())
    if (projectId != null) fd.append('project_id', String(projectId))

    const { ok, data } = await api.createPost(fd)
    setSubmitting(false)

    if (!ok) {
      setError(data?.error || 'Failed to post')
      return
    }

    onPosted(data)
    onClose()
  }

  const gradeLabel =
    gradeScale === 'v' ? `V${gradeValue}` : `Comp ${gradeValue}`

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">New post</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Photo picker */}
        <label className="block cursor-pointer">
          <div className="aspect-square w-full bg-stone-100 rounded-xl overflow-hidden flex items-center justify-center hover:bg-stone-200 transition border border-stone-200">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-stone-500 text-sm">
                <span className="text-2xl">＋</span>
                <div>Add photo</div>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </label>

        {/* Grade scale + value */}
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
                setProjectSelection(null)
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

        {/* Project linking — optional, available for any outcome */}
        <div className="mt-4">
            <label className="block text-sm font-medium text-stone-700">
              Link to a project?{' '}
              <span className="text-stone-400">(optional)</span>
            </label>
            <div className="mt-2 space-y-2">
              {loadingProjects && (
                <div className="text-xs text-stone-400">Loading…</div>
              )}

              {!loadingProjects && matchingProjects.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {matchingProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setProjectSelection(
                          projectSelection === p.id ? null : p.id
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-sm transition border ${
                        projectSelection === p.id
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}

              {!loadingProjects && matchingProjects.length === 0 && (
                <div className="text-xs text-stone-400">
                  No existing {gradeLabel} projects.
                </div>
              )}

              {/* New project option */}
              {projectSelection !== 'new' ? (
                <button
                  type="button"
                  onClick={() => setProjectSelection('new')}
                  className="text-sm text-stone-600 hover:text-stone-900 underline"
                >
                  + New project
                </button>
              ) : (
                <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-2">
                  <input
                    type="text"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    placeholder={`Title (e.g. "orange ${gradeLabel} cave")`}
                    maxLength={120}
                    autoFocus
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setProjectSelection(null)
                      setNewProjectTitle('')
                    }}
                    className="text-xs text-stone-500 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                </div>
              )}
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
          disabled={submitting || !photo}
          className="mt-5 w-full bg-stone-900 text-white rounded-lg px-4 py-2 font-medium hover:bg-stone-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  )
}
