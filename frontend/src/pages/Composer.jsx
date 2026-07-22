import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import GymPickerSheet from '../components/GymPickerSheet'
import PostFields from '../components/PostFields'
import { HOLD_COLORS, OUTCOMES, ATTEMPTS } from '../lib/postFieldOptions'
import { loadDraft, saveDraftDebounced, clearDraft } from '../lib/draftStorage'

const MAX_CARDS = 12

function makeEmptyCard(gymId = '') {
  return {
    id: crypto.randomUUID(),
    gradeScale: 'v',
    gradeValue: 0,
    outcome: 'sent',
    attempts: '1',
    notes: '',
    holdColor: null,
    gymId,
    projectSelection: null,
    newProjectTitle: '',
    photoFile: null,
    photoPreviewUrl: null,
    photoThumbDataUrl: null,
    needsPhotoReattach: false,
    error: null,
  }
}

function validateCard(card) {
  if (!card.photoFile || card.needsPhotoReattach) return 'Add a photo'
  if (!card.holdColor) return 'Pick a hold color'
  if (!card.gymId) return 'Pick a gym'
  if (card.projectSelection === 'new' && !card.newProjectTitle.trim()) return 'Project title required'
  return null
}

export default function Composer({ user, post, onClose, onPosted, onUpdated }) {
  const isEdit = !!post

  // ── Edit-mode state (single post, unchanged behavior) ──────────────────────
  const [gradeScale, setGradeScale] = useState(post?.grade_scale ?? 'v')
  const [gradeValue, setGradeValue] = useState(post?.grade_value ?? 0)
  const [outcome, setOutcome] = useState(post?.outcome ?? 'sent')
  const [attempts, setAttempts] = useState(post?.attempts_bucket ?? '1')
  const [notes, setNotes] = useState(post?.notes ?? '')
  const [holdColor, setHoldColor] = useState(post?.hold_color ?? null)
  const [editGymId, setEditGymId] = useState(post?.gym ? String(post.gym.id) : '')
  const [editGymOpen, setEditGymOpen] = useState(false)
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  // ── Create-mode state (one or more independent cards, swipeable) ───────────
  const [cards, setCards] = useState(() => {
    if (isEdit) return []
    const draft = loadDraft()
    return draft && draft.length > 0 ? draft : [makeEmptyCard()]
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const [gymOpenCardId, setGymOpenCardId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [postedCount, setPostedCount] = useState(0)

  const [gyms, setGyms] = useState([])
  const [activeProjects, setActiveProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  const dragStateRef = useRef({ startX: 0, startY: 0, dx: 0, axisLocked: null })
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef(null)

  // Lock body scroll. Paired with `overscroll-behavior: none` on html/body
  // (index.css) so iOS has nowhere to hand off rubber-band momentum when the
  // modal's own scroll hits a boundary — the previous position:fixed +
  // scrollY-restore hack left that handoff ambiguous, which is what caused
  // the "stuck, needs a forceful swipe" scroll lock at the bottom of the form.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.listGyms().then(({ ok, data }) => {
      if (cancelled) return
      const list = ok ? data.gyms : []
      setGyms(list)
      if (list.length === 0) return
      if (isEdit) {
        setEditGymId((prev) => prev || String(list[0].id))
      } else {
        setCards((prev) => prev.map((c) => (c.gymId ? c : { ...c, gymId: String(list[0].id) })))
      }
    })
    return () => { cancelled = true }
  }, [isEdit])

  useEffect(() => {
    if (isEdit || !user?.username) return
    let cancelled = false
    setLoadingProjects(true)
    api.listUserProjects(user.username, 'active').then(({ ok, data }) => {
      if (cancelled) return
      if (ok) setActiveProjects(data.projects)
      setLoadingProjects(false)
    })
    return () => { cancelled = true }
  }, [isEdit, user?.username])

  // Persist the in-progress batch so backgrounding/eviction doesn't lose it —
  // sessionStorage clears itself when the tab/PWA instance actually closes.
  useEffect(() => {
    if (isEdit) return
    saveDraftDebounced(cards)
  }, [isEdit, cards])

  function updateCard(id, patch) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function addCard() {
    if (cards.length >= MAX_CARDS) return
    const gymDefault = cards[activeIndex]?.gymId || (gyms[0] ? String(gyms[0].id) : '')
    setActiveIndex(cards.length)
    setCards((prev) => [...prev, makeEmptyCard(gymDefault)])
  }

  function removeCard(id) {
    setCards((prev) => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex((c) => c.id === id)
      const next = prev.filter((c) => c.id !== id)
      setActiveIndex(Math.max(0, Math.min(idx, next.length - 1)))
      return next
    })
  }

  function handleDiscard() {
    clearDraft()
    onClose()
  }

  const hasDraftContent = !isEdit && (
    cards.length > 1 ||
    cards.some((c) =>
      c.photoFile || c.photoPreviewUrl || c.needsPhotoReattach || c.notes ||
      c.holdColor || c.gradeValue !== 0 || c.projectSelection != null
    )
  )

  // ── Swipe gesture (touch only — desktop uses the chevrons) ─────────────────
  function onTouchStart(e) {
    const t = e.touches[0]
    dragStateRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, axisLocked: null }
  }

  function onTouchMove(e) {
    if (submitting) return
    const ds = dragStateRef.current
    const t = e.touches[0]
    if (ds.axisLocked === null) {
      const dx = t.clientX - ds.startX
      const dy = t.clientY - ds.startY
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      ds.axisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (ds.axisLocked === 'x') setIsDragging(true)
    }
    if (ds.axisLocked !== 'x') return
    e.preventDefault()
    ds.dx = t.clientX - ds.startX
    setDragOffset(ds.dx)
  }

  function onTouchEnd() {
    const ds = dragStateRef.current
    if (ds.axisLocked === 'x') {
      const width = trackRef.current?.offsetWidth || 1
      const threshold = width * 0.2
      if (ds.dx < -threshold && activeIndex < cards.length - 1) setActiveIndex((i) => i + 1)
      else if (ds.dx > threshold && activeIndex > 0) setActiveIndex((i) => i - 1)
    }
    setIsDragging(false)
    setDragOffset(0)
  }

  const matchingProjectsFor = (card) =>
    activeProjects.filter((p) => p.grade_scale === card.gradeScale && p.grade_value === card.gradeValue)

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()

    if (isEdit) {
      if (!editGymId) { setEditError('Pick a gym'); return }
      setEditError(null)
      setEditSubmitting(true)
      const { ok, data } = await api.updatePost(post.id, {
        grade_scale: gradeScale,
        grade_value: gradeValue,
        outcome,
        attempts_bucket: attempts,
        notes: notes.trim() || null,
        hold_color: holdColor,
        gym_id: Number(editGymId),
      })
      setEditSubmitting(false)
      if (!ok) { setEditError(data?.error || 'Failed to update'); return }
      onUpdated(data)
      onClose()
      return
    }

    const errors = cards.map(validateCard)
    const firstInvalid = errors.findIndex((err) => err !== null)
    if (firstInvalid !== -1) {
      setCards((prev) => prev.map((c, i) => ({ ...c, error: errors[i] })))
      setActiveIndex(firstInvalid)
      return
    }

    setSubmitting(true)
    setPostedCount(0)

    let remaining = cards
    for (const card of cards) {
      let projectId = typeof card.projectSelection === 'number' ? card.projectSelection : null

      if (card.projectSelection === 'new') {
        const projectFd = new FormData()
        projectFd.append('title', card.newProjectTitle.trim())
        projectFd.append('grade_scale', card.gradeScale)
        projectFd.append('grade_value', String(card.gradeValue))
        projectFd.append('photo', card.photoFile)

        const res = await api.createProject(projectFd)
        if (!res.ok) {
          setSubmitting(false)
          const idx = remaining.findIndex((c) => c.id === card.id)
          setCards(remaining.map((c) => (c.id === card.id ? { ...c, error: res.data?.error || 'Failed to create project' } : c)))
          setActiveIndex(idx)
          return
        }
        projectId = res.data.id
      }

      const fd = new FormData()
      fd.append('photo', card.photoFile)
      fd.append('grade_scale', card.gradeScale)
      fd.append('grade_value', String(card.gradeValue))
      fd.append('outcome', card.outcome)
      fd.append('attempts_bucket', card.attempts)
      if (card.notes.trim()) fd.append('notes', card.notes.trim())
      fd.append('hold_color', card.holdColor)
      if (projectId != null) fd.append('project_id', String(projectId))
      fd.append('gym_id', card.gymId)

      const { ok, data } = await api.createPost(fd)
      if (!ok) {
        setSubmitting(false)
        const idx = remaining.findIndex((c) => c.id === card.id)
        setCards(remaining.map((c) => (c.id === card.id ? { ...c, error: data?.error || 'Failed to post' } : c)))
        setActiveIndex(idx)
        return
      }

      onPosted(data)
      remaining = remaining.filter((c) => c.id !== card.id)
      setCards(remaining)
      setPostedCount((n) => n + 1)
    }

    setSubmitting(false)
    clearDraft()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl max-w-md w-full p-6 max-h-[100vh] sm:max-h-[90vh] overflow-y-auto overscroll-contain shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          {!isEdit && cards.length > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                disabled={activeIndex === 0 || submitting}
                aria-label="Previous climb"
                className="text-lg text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-30"
              >
                ‹
              </button>
              <h2 className="text-xl font-semibold">
                New Posts{' '}
                <span className="text-sm font-normal text-stone-400 dark:text-stone-500">
                  {activeIndex + 1}/{cards.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveIndex((i) => Math.min(cards.length - 1, i + 1))}
                disabled={activeIndex === cards.length - 1 || submitting}
                aria-label="Next climb"
                className="text-lg text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          ) : (
            <h2 className="text-xl font-semibold">{isEdit ? 'Edit post' : 'New post'}</h2>
          )}
          <div className="flex items-center gap-3">
            {hasDraftContent && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={submitting}
                className="text-xs text-stone-400 dark:text-stone-500 hover:text-red-500 underline"
              >
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-xl leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {isEdit ? (
          <>
            <div className="aspect-square w-full bg-stone-100 dark:bg-stone-800 rounded-xl overflow-hidden relative border border-stone-200 dark:border-stone-800">
              <img
                src={`${api.baseUrl}/media/${post.photo_path}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-xs text-stone-400 dark:text-stone-500 mt-1 text-center">
              Photo can't be changed
            </div>

            {/* Grade scale + value */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Grade</label>
              <div className="mt-2 flex gap-2">
                {[['v', 'V'], ['comp', 'Comp']].map(([s, label]) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setGradeScale(s)
                      const min = s === 'v' ? 0 : 1
                      const max = s === 'v' ? 9 : 4
                      if (gradeValue < min) setGradeValue(min)
                      if (gradeValue > max) setGradeValue(max)
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      gradeScale === s
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={`mt-2 grid gap-2 ${gradeScale === 'v' ? 'grid-cols-5' : 'grid-cols-4'}`}>
                {Array.from(
                  { length: (gradeScale === 'v' ? 12 : 4) - (gradeScale === 'v' ? 0 : 1) + 1 },
                  (_, i) => (gradeScale === 'v' ? 0 : 1) + i
                ).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setGradeValue(n)}
                    className={`py-1.5 rounded-lg text-sm font-medium transition ${
                      gradeValue === n
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {gradeScale === 'v' ? `V${n}` : `C${n}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Hold color */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Hold color</label>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {HOLD_COLORS.map(({ hex, name }) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setHoldColor(holdColor === hex ? null : hex)}
                    aria-label={name}
                    className={`w-8 h-8 rounded-full transition ${holdColor === hex ? 'ring-2 ring-offset-2 ring-stone-900 dark:ring-stone-100' : 'hover:scale-110'}`}
                    style={{ backgroundColor: hex, border: hex === '#F5F5F4' ? '1px solid #d6d3d1' : 'none' }}
                  />
                ))}
              </div>
            </div>

            {/* Outcome */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Outcome</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {OUTCOMES.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setOutcome(v)}
                    className={`px-2 py-1.5 rounded-lg text-sm font-medium transition ${
                      outcome === v
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Attempts */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Attempts</label>
              <div className="mt-1 grid grid-cols-5 gap-2">
                {ATTEMPTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAttempts(a)}
                    className={`px-2 py-1.5 rounded-lg text-sm font-medium transition ${
                      attempts === a
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
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
                className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
            </div>

            {/* Gym */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Gym</label>
              {gyms.length === 0 ? (
                <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Loading gyms…</div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditGymOpen(true)}
                  className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white dark:bg-stone-900"
                >
                  {(() => {
                    const sel = gyms.find((g) => String(g.id) === editGymId)
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
              )}
            </div>

            <GymPickerSheet
              gyms={gyms}
              gymId={editGymId}
              onSelect={setEditGymId}
              open={editGymOpen}
              onClose={() => setEditGymOpen(false)}
            />

            {editError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{editError}</p>}

            <button
              type="submit"
              disabled={editSubmitting}
              className="mt-5 w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editSubmitting ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <>
            <div className="overflow-hidden">
              <div
                ref={trackRef}
                className="flex"
                style={{
                  transform: `translateX(calc(-${activeIndex * 100}% + ${dragOffset}px))`,
                  transition: isDragging ? 'none' : 'transform 200ms ease-out',
                  pointerEvents: submitting ? 'none' : 'auto',
                  opacity: submitting ? 0.6 : 1,
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {cards.map((card) => (
                  <div key={card.id} className="w-full flex-shrink-0">
                    <PostFields
                      card={card}
                      onChange={(patch) => updateCard(card.id, patch)}
                      gyms={gyms}
                      onGymOpen={() => setGymOpenCardId(card.id)}
                      matchingProjects={matchingProjectsFor(card)}
                      loadingProjects={loadingProjects}
                    />
                  </div>
                ))}
              </div>
            </div>

            <GymPickerSheet
              gyms={gyms}
              gymId={cards.find((c) => c.id === gymOpenCardId)?.gymId ?? ''}
              onSelect={(id) => gymOpenCardId && updateCard(gymOpenCardId, { gymId: id })}
              open={gymOpenCardId != null}
              onClose={() => setGymOpenCardId(null)}
            />

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={addCard}
                disabled={cards.length >= MAX_CARDS || submitting}
                className="text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 underline disabled:opacity-40 disabled:no-underline"
              >
                + Add another climb
              </button>
              {cards.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCard(cards[activeIndex].id)}
                  disabled={submitting}
                  className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-40"
                >
                  Remove this climb
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? (cards.length > 1 ? `Posting ${Math.min(postedCount + 1, cards.length)} of ${cards.length}…` : 'Posting…')
                : (cards.length > 1 ? `Post all (${cards.length})` : 'Post')}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
