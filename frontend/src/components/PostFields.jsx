import { useEffect, useRef, useState } from 'react'
import { HOLD_COLORS, OUTCOMES, ATTEMPTS } from '../lib/postFieldOptions'
import { makeThumbnail } from '../lib/draftStorage'

// ── Canvas helpers (route-highlight lasso tool) ────────────────────────────────

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

function buildOverlay(W, H, points) {
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

// Renders the create-mode field set (photo/lasso, grade, hold color, outcome,
// project link, attempts, notes, gym trigger) for one post. Fully controlled
// via `card`/`onChange` so a batch composer can mount one instance per card.
export default function PostFields({
  card,
  onChange,
  gyms,
  onGymOpen,
  matchingProjects,
  loadingProjects,
}) {
  const [localError, setLocalError] = useState(null)
  const [lassoActive, setLassoActive] = useState(false)
  const [lassoApplied, setLassoApplied] = useState(false)

  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const originalFileRef = useRef(card.photoFile ?? null)
  const originalUrlRef = useRef(card.photoPreviewUrl ?? null)
  const isDrawingRef = useRef(false)
  const pointsRef = useRef([])

  const gradeMin = card.gradeScale === 'v' ? 0 : 1
  const gradeMax = card.gradeScale === 'v' ? 12 : 4
  const gradeLabel = card.gradeScale === 'v' ? `V${card.gradeValue}` : `Comp ${card.gradeValue}`

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
        renderFrame(canvas, imgRef.current, [])
        return
      }
      const overlay = buildOverlay(canvas.width, canvas.height, points)
      renderFrame(canvas, imgRef.current, points, overlay)

      const img = imgRef.current
      const outputSize = Math.min(Math.min(img.naturalWidth, img.naturalHeight), 1200)
      const ratio = outputSize / canvas.width
      const hiResPoints = points.map((pt) => ({ x: pt.x * ratio, y: pt.y * ratio }))

      const hiResCanvas = document.createElement('canvas')
      hiResCanvas.width = outputSize
      hiResCanvas.height = outputSize
      const hiResCtx = hiResCanvas.getContext('2d')
      drawImageCover(hiResCtx, img, outputSize, outputSize)
      hiResCtx.drawImage(buildOverlay(outputSize, outputSize, hiResPoints), 0, 0)

      hiResCanvas.toBlob((blob) => {
        if (!blob) return
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        setLassoApplied(true)
        setLassoActive(false)
        onChange({ photoFile: file, photoPreviewUrl: url })
        makeThumbnail(file).then((thumb) => {
          if (thumb) onChange({ photoThumbDataUrl: thumb })
        })
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
    setLassoApplied(false)
    setLassoActive(false)
    pointsRef.current = []
    onChange({ photoFile: originalFileRef.current, photoPreviewUrl: originalUrlRef.current })
    if (originalFileRef.current) {
      makeThumbnail(originalFileRef.current).then((thumb) => {
        if (thumb) onChange({ photoThumbDataUrl: thumb })
      })
    }
  }

  function handlePhotoChange(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      setLocalError('Photo must be under 20 MB')
      return
    }
    setLocalError(null)
    const url = URL.createObjectURL(f)
    originalFileRef.current = f
    originalUrlRef.current = url
    setLassoActive(false)
    setLassoApplied(false)
    pointsRef.current = []
    onChange({ photoFile: f, photoPreviewUrl: url, needsPhotoReattach: false })
    makeThumbnail(f).then((thumb) => {
      if (thumb) onChange({ photoThumbDataUrl: thumb })
    })
  }

  function handleScaleChange(scale) {
    const min = scale === 'v' ? 0 : 1
    const max = scale === 'v' ? 9 : 4
    const patch = { gradeScale: scale, projectSelection: null }
    if (card.gradeValue < min) patch.gradeValue = min
    if (card.gradeValue > max) patch.gradeValue = max
    onChange(patch)
  }

  return (
    <div>
      {/* Photo — reattach prompt (post-restore), upload+lasso, or empty placeholder */}
      <div className="aspect-square w-full bg-stone-100 dark:bg-stone-800 rounded-xl overflow-hidden relative border border-stone-200 dark:border-stone-800">
        {card.needsPhotoReattach ? (
          <label className="relative flex w-full h-full items-center justify-center cursor-pointer">
            {card.photoThumbDataUrl && (
              <img src={card.photoThumbDataUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
            )}
            <div className="relative text-white text-sm text-center px-4 py-2 bg-black/60 rounded-lg">
              Tap to reattach photo
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </label>
        ) : !card.photoPreviewUrl ? (
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
        ) : !lassoActive ? (
          <>
            <img src={card.photoPreviewUrl} alt="preview" className="w-full h-full object-cover" />
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
        ) : (
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
          {[['v', 'V'], ['comp', 'Comp']].map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => handleScaleChange(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                card.gradeScale === s
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={`mt-2 grid gap-2 ${card.gradeScale === 'v' ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {Array.from({ length: gradeMax - gradeMin + 1 }, (_, i) => gradeMin + i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ gradeValue: n, projectSelection: null })}
              className={`py-1.5 rounded-lg text-sm font-medium transition ${
                card.gradeValue === n
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              {card.gradeScale === 'v' ? `V${n}` : `C${n}`}
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
              onClick={() => onChange({ holdColor: card.holdColor === hex ? null : hex })}
              aria-label={name}
              className={`w-8 h-8 rounded-full transition ${card.holdColor === hex ? 'ring-2 ring-offset-2 ring-stone-900 dark:ring-stone-100' : 'hover:scale-110'}`}
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
              onClick={() => onChange({ outcome: v })}
              className={`px-2 py-1.5 rounded-lg text-sm font-medium transition ${
                card.outcome === v
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
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
                  onClick={() => onChange({ projectSelection: card.projectSelection === p.id ? null : p.id })}
                  className={`px-3 py-1.5 rounded-lg text-sm transition border ${
                    card.projectSelection === p.id
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

          {card.projectSelection !== 'new' ? (
            <button
              type="button"
              onClick={() => onChange({ projectSelection: 'new' })}
              className="text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 underline"
            >
              + New project
            </button>
          ) : (
            <div className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 space-y-2">
              <input
                type="text"
                value={card.newProjectTitle}
                onChange={(e) => onChange({ newProjectTitle: e.target.value })}
                placeholder={`Title (e.g. "orange ${gradeLabel} cave")`}
                maxLength={120}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-base text-stone-900 dark:text-stone-100 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
              <button
                type="button"
                onClick={() => onChange({ projectSelection: null, newProjectTitle: '' })}
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
              onClick={() => onChange({ attempts: a })}
              className={`px-2 py-1.5 rounded-lg text-sm font-medium transition ${
                card.attempts === a
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
          value={card.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          maxLength={2000}
          rows={2}
          placeholder="Beta, thoughts, etc."
          className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900"
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
          <button
            type="button"
            onClick={onGymOpen}
            className="mt-1 w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white dark:bg-stone-900"
          >
            {(() => {
              const sel = gyms.find((g) => String(g.id) === card.gymId)
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

      {(localError || card.error) && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{localError || card.error}</p>
      )}
    </div>
  )
}
