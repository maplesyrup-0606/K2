import { useState, useEffect, useRef } from 'react'
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

// ── Canvas helpers ────────────────────────────────────────────────────────────

function drawImageCover(ctx, img, W, H) {
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const srcW = W / scale
  const srcH = H / scale
  const srcX = (img.naturalWidth - srcW) / 2
  const srcY = (img.naturalHeight - srcH) / 2
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, W, H)
}

// Returns an overlay canvas: dark everywhere, feathered-transparent inside the lasso.
function buildOverlay(W, H, points) {
  // Mask: blurred white shape inside the lasso path → opaque inside, transparent outside
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = W
  maskCanvas.height = H
  const mCtx = maskCanvas.getContext('2d')
  const blur = Math.round(Math.min(W, H) * 0.025)
  mCtx.filter = `blur(${blur}px)`
  mCtx.fillStyle = 'white'
  mCtx.beginPath()
  points.forEach((pt, i) => (i === 0 ? mCtx.moveTo(pt.x, pt.y) : mCtx.lineTo(pt.x, pt.y)))
  mCtx.closePath()
  mCtx.fill()
  mCtx.filter = 'none'

  // Overlay: fill dark, then erase where mask is opaque (inside lasso)
  const oCanvas = document.createElement('canvas')
  oCanvas.width = W
  oCanvas.height = H
  const oCtx = oCanvas.getContext('2d')
  oCtx.fillStyle = 'rgba(0,0,0,0.65)'
  oCtx.fillRect(0, 0, W, H)
  oCtx.globalCompositeOperation = 'destination-out'
  oCtx.drawImage(maskCanvas, 0, 0)
  return oCanvas
}

function renderFrame(canvas, img, points, overlay = null) {
  if (!canvas || !img) return
  const { width: W, height: H } = canvas
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)
  drawImageCover(ctx, img, W, H)
  if (overlay) ctx.drawImage(overlay, 0, 0)
  if (points.length < 2) return
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.88)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 4])
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 3
  ctx.beginPath()
  points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)))
  if (overlay) ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function getCanvasPoint(e, canvas) {
  const rect = canvas.getBoundingClientRect()
  const src = e.touches ? e.touches[0] : e
  return {
    x: Math.max(0, Math.min(canvas.width, (src.clientX - rect.left) * (canvas.width / rect.width))),
    y: Math.max(0, Math.min(canvas.height, (src.clientY - rect.top) * (canvas.height / rect.height))),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Composer({ user, onClose, onPosted }) {
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [gradeScale, setGradeScale] = useState('v')
  const [gradeValue, setGradeValue] = useState(0)
  const [outcome, setOutcome] = useState('sent')
  const [attempts, setAttempts] = useState('1')
  const [notes, setNotes] = useState('')
  const [holdColor, setHoldColor] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [gyms, setGyms] = useState([])
  const [gymId, setGymId] = useState('')
  const [gymOpen, setGymOpen] = useState(false)

  const [projectSelection, setProjectSelection] = useState(null)
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [activeProjects, setActiveProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.listGyms().then(({ ok, data }) => {
      if (cancelled) return
      const list = ok ? data.gyms : []
      setGyms(list)
      if (list.length > 0) setGymId(String(list[0].id))
    })
    return () => { cancelled = true }
  }, [])

  // Lock body scroll for the duration the modal is mounted
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Lasso
  const [lassoActive, setLassoActive] = useState(false)
  const [lassoApplied, setLassoApplied] = useState(false)

  const canvasRef = useRef(null)
  const imgRef = useRef(null)          // original Image element for canvas redraws
  const originalFileRef = useRef(null) // original File, preserved so Clear can restore it
  const originalUrlRef = useRef(null)  // original blob URL
  const isDrawingRef = useRef(false)
  const pointsRef = useRef([])

  const gradeMin = gradeScale === 'v' ? 0 : 1
  const gradeMax = gradeScale === 'v' ? 9 : 4

  useEffect(() => {
    if (!user?.username) return
    let cancelled = false
    setLoadingProjects(true)
    api.listUserProjects(user.username, 'active').then(({ ok, data }) => {
      if (cancelled) return
      if (ok) setActiveProjects(data.projects)
      setLoadingProjects(false)
    })
    return () => { cancelled = true }
  }, [user?.username])

  function handleScaleChange(scale) {
    setGradeScale(scale)
    const min = scale === 'v' ? 0 : 1
    const max = scale === 'v' ? 9 : 4
    if (gradeValue < min) setGradeValue(min)
    if (gradeValue > max) setGradeValue(max)
    setProjectSelection(null)
  }

  function handlePhotoChange(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      setError('Photo must be under 20 MB')
      return
    }
    setError(null)
    const url = URL.createObjectURL(f)
    originalFileRef.current = f
    originalUrlRef.current = url
    setPhoto(f)
    setPhotoPreview(url)
    setLassoActive(false)
    setLassoApplied(false)
    pointsRef.current = []
  }

  // Load original image into canvas when lasso mode activates
  useEffect(() => {
    if (!lassoActive) return
    const canvas = canvasRef.current
    if (!canvas || !originalUrlRef.current) return

    const img = new window.Image()
    img.onload = () => {
      imgRef.current = img
      requestAnimationFrame(() => {
        const c = canvasRef.current
        if (!c) return
        const size = c.offsetWidth || 400
        c.width = size
        c.height = size
        renderFrame(c, img, [])
      })
    }
    img.src = originalUrlRef.current
  }, [lassoActive])

  // Attach drawing event listeners (non-passive touch so we can preventDefault)
  useEffect(() => {
    if (!lassoActive) return
    const canvas = canvasRef.current
    if (!canvas) return

    const onStart = (e) => {
      e.preventDefault()
      isDrawingRef.current = true
      pointsRef.current = [getCanvasPoint(e, canvas)]
      renderFrame(canvas, imgRef.current, pointsRef.current)
    }

    const onMove = (e) => {
      if (!isDrawingRef.current) return
      e.preventDefault()
      pointsRef.current.push(getCanvasPoint(e, canvas))
      renderFrame(canvas, imgRef.current, pointsRef.current)
    }

    const onEnd = (e) => {
      if (!isDrawingRef.current) return
      e.preventDefault()
      isDrawingRef.current = false
      const points = pointsRef.current
      if (points.length < 8) {
        // Accidental tap — reset without applying
        renderFrame(canvas, imgRef.current, [])
        return
      }
      const overlay = buildOverlay(canvas.width, canvas.height, points)
      renderFrame(canvas, imgRef.current, points, overlay)

      // Bake at full resolution using the image's natural dimensions, not the display canvas size.
      // The display canvas is ~390px on mobile; the original photo may be 3000+ px.
      const img = imgRef.current
      const outputSize = Math.min(Math.min(img.naturalWidth, img.naturalHeight), 1200)
      const ratio = outputSize / canvas.width
      const hiResPoints = points.map(pt => ({ x: pt.x * ratio, y: pt.y * ratio }))

      const hiResCanvas = document.createElement('canvas')
      hiResCanvas.width = outputSize
      hiResCanvas.height = outputSize
      const hiResCtx = hiResCanvas.getContext('2d')
      drawImageCover(hiResCtx, img, outputSize, outputSize)
      hiResCtx.drawImage(buildOverlay(outputSize, outputSize, hiResPoints), 0, 0)

      hiResCanvas.toBlob((blob) => {
        if (!blob) return
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
        setPhoto(file)
        setPhotoPreview(URL.createObjectURL(blob))
        setLassoApplied(true)
        setLassoActive(false)
      }, 'image/jpeg', 0.95)
    }

    canvas.addEventListener('touchstart', onStart, { passive: false })
    canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onEnd, { passive: false })
    canvas.addEventListener('mousedown', onStart)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)

    return () => {
      canvas.removeEventListener('touchstart', onStart)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onEnd)
      canvas.removeEventListener('mousedown', onStart)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
    }
  }, [lassoActive])

  function handleClearLasso() {
    setPhoto(originalFileRef.current)
    setPhotoPreview(originalUrlRef.current)
    setLassoApplied(false)
    setLassoActive(false)
    pointsRef.current = []
  }

  const matchingProjects = activeProjects.filter(
    (p) => p.grade_scale === gradeScale && p.grade_value === gradeValue
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!photo) {
      setError('Photo is required')
      return
    }
    if (!holdColor) {
      setError('Pick a hold color')
      return
    }
    if (!gymId) {
      setError('Pick a gym')
      return
    }
    if (projectSelection === 'new' && !newProjectTitle.trim()) {
      setError('Project title required')
      return
    }

    setError(null)
    setSubmitting(true)

    let projectId = null

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

    const fd = new FormData()
    fd.append('photo', photo)
    fd.append('grade_scale', gradeScale)
    fd.append('grade_value', String(gradeValue))
    fd.append('outcome', outcome)
    fd.append('attempts_bucket', attempts)
    if (notes.trim()) fd.append('notes', notes.trim())
    fd.append('hold_color', holdColor)
    if (projectId != null) fd.append('project_id', String(projectId))
    fd.append('gym_id', gymId)

    const { ok, data } = await api.createPost(fd)
    setSubmitting(false)

    if (!ok) {
      setError(data?.error || 'Failed to post')
      return
    }

    onPosted(data)
    onClose()
  }

  const gradeLabel = gradeScale === 'v' ? `V${gradeValue}` : `Comp ${gradeValue}`

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl max-w-md w-full p-6 max-h-[100vh] sm:max-h-[90vh] overflow-y-auto overscroll-contain shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">New post</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Photo area */}
        <div className="aspect-square w-full bg-stone-100 dark:bg-stone-800 rounded-xl overflow-hidden relative border border-stone-200 dark:border-stone-800">

          {/* Empty state */}
          {!photoPreview && (
            <label className="flex w-full h-full items-center justify-center cursor-pointer hover:bg-stone-200 dark:hover:bg-stone-700 transition">
              <div className="text-stone-500 dark:text-stone-400 text-sm text-center">
                <span className="text-2xl">＋</span>
                <div>Add photo</div>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
          )}

          {/* Photo preview (not in lasso drawing mode) */}
          {photoPreview && !lassoActive && (
            <>
              <img
                src={photoPreview}
                alt="preview"
                className="w-full h-full object-cover"
              />
              {/* Bottom gradient bar with controls */}
              <div
                className="absolute bottom-0 inset-x-0 flex items-center justify-between px-3 py-2.5"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)' }}
              >
                {!lassoApplied ? (
                  <button
                    type="button"
                    onClick={() => setLassoActive(true)}
                    className="flex items-center gap-1.5 text-white text-xs font-medium bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full px-3 py-1.5 transition"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                    Highlight route
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleClearLasso}
                    className="flex items-center gap-1.5 text-white text-xs font-medium bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full px-3 py-1.5 transition"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                    </svg>
                    Redraw
                  </button>
                )}
                <label className="cursor-pointer text-white text-xs font-medium bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full px-3 py-1.5 transition">
                  Change
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </label>
              </div>
            </>
          )}

          {/* Lasso drawing mode */}
          {lassoActive && (
            <>
              <canvas
                ref={canvasRef}
                className="block w-full h-full"
                style={{ touchAction: 'none', cursor: 'crosshair' }}
              />
              <div
                className="absolute bottom-0 inset-x-0 flex items-center justify-between px-3 py-2.5 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)' }}
              >
                <span className="text-white/90 text-xs font-medium">Draw around your route</span>
                <button
                  type="button"
                  onClick={() => setLassoActive(false)}
                  className="pointer-events-auto text-white text-xs font-medium bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full px-3 py-1.5 transition"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

        {/* Grade scale + value */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Grade
          </label>
          <div className="mt-2 flex gap-2">
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
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={`mt-2 grid gap-2 ${gradeScale === 'v' ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {Array.from({ length: gradeMax - gradeMin + 1 }, (_, i) => gradeMin + i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { setGradeValue(n); setProjectSelection(null) }}
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
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Hold color
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

        {/* Project linking */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Link to a project?{' '}
            <span className="text-stone-400 dark:text-stone-500">(optional)</span>
          </label>
          <div className="mt-2 space-y-2">
            {loadingProjects && (
              <div className="text-xs text-stone-400 dark:text-stone-500">Loading…</div>
            )}

            {!loadingProjects && matchingProjects.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {matchingProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProjectSelection(projectSelection === p.id ? null : p.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition border ${
                      projectSelection === p.id
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900'
                        : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}

            {!loadingProjects && matchingProjects.length === 0 && (
              <div className="text-xs text-stone-400 dark:text-stone-500">
                No existing {gradeLabel} projects.
              </div>
            )}

            {projectSelection !== 'new' ? (
              <button
                type="button"
                onClick={() => setProjectSelection('new')}
                className="text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 underline"
              >
                + New project
              </button>
            ) : (
              <div className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 space-y-2">
                <input
                  type="text"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder={`Title (e.g. "orange ${gradeLabel} cave")`}
                  maxLength={120}
                  autoFocus
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
                <button
                  type="button"
                  onClick={() => { setProjectSelection(null); setNewProjectTitle('') }}
                  className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  Cancel
                </button>
              </div>
            )}
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

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !photo}
          className="mt-5 w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  )
}
