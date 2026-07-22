const DRAFT_KEY = 'k2:composer-draft'
const SAVE_DEBOUNCE_MS = 300
const THUMB_MAX_DIMENSION = 480
const THUMB_QUALITY = 0.5

let saveTimer = null

// File/URL objects can't survive JSON serialization, and per-card submit
// errors shouldn't be replayed on restore — persist only the rest.
function serializeCard(card) {
  return Object.fromEntries(
    Object.entries(card).filter(([key]) => !['photoFile', 'photoPreviewUrl', 'error'].includes(key))
  )
}

export function saveDraftDebounced(cards) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(cards.map(serializeCard)))
    } catch {
      // Quota exceeded or storage unavailable — draft persistence is a nice-to-have, not correctness-critical.
    }
  }, SAVE_DEBOUNCE_MS)
}

export function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const cards = JSON.parse(raw)
    if (!Array.isArray(cards) || cards.length === 0) return null
    return cards.map((card) => ({
      ...card,
      photoFile: null,
      photoPreviewUrl: null,
      needsPhotoReattach: true,
      error: null,
    }))
  } catch {
    return null
  }
}

export function clearDraft() {
  if (saveTimer) clearTimeout(saveTimer)
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

export function makeThumbnail(file) {
  return new Promise((resolve) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, THUMB_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', THUMB_QUALITY))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}
