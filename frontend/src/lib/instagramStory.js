import { api } from '../api'

// Instagram Story canvas size (9:16)
const CARD_WIDTH = 1080
const CARD_HEIGHT = 1920

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: s * 100 }
}

// Fixed, muted saturation/lightness so the tint always reads as pastel —
// only the hue rides on the hold color. Near-grayscale hold colors (black/
// white/gray) don't have a meaningful hue, so they fall back to a neutral tone.
function pastelBackground(hex) {
  if (hex) {
    const { h, s } = hexToHsl(hex)
    if (s >= 12) {
      return { top: `hsl(${h} 45% 93%)`, bottom: `hsl(${h} 55% 82%)` }
    }
  }
  return { top: 'hsl(30 15% 94%)', bottom: 'hsl(30 12% 84%)' }
}

// Authenticated media needs to come in as a same-origin blob: URL —
// drawing a cross-origin <img> straight onto canvas taints it and blocks toBlob().
async function loadImage(url) {
  const res = await fetch(url, { credentials: 'include' })
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    el.src = objectUrl
  })
  URL.revokeObjectURL(objectUrl)
  return img
}

// Mirrors the badge text logic in PostCard's outcomeBadge(), with an emoji per status.
function statusLabel(post) {
  if (post.is_flash) return '⚡ Flash'
  if (post.outcome === 'sent') return '✅ Sent'
  if (post.outcome === 'projecting') return '💪 Project-ing'
  return '🏳️ Gave up'
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Draws `img` into the (x, y, w, h) box, center-cropped like CSS object-fit: cover,
// clipped to rounded corners.
function drawCoverImage(ctx, img, x, y, w, h, radius) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.clip()

  const boxRatio = w / h
  const imgRatio = img.width / img.height
  let sx, sy, sw, sh
  if (imgRatio > boxRatio) {
    sh = img.height
    sw = sh * boxRatio
    sx = (img.width - sw) / 2
    sy = 0
  } else {
    sw = img.width
    sh = sw / boxRatio
    sx = 0
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

// Renders a 1080x1920 Instagram Story card for a post and resolves with a PNG Blob.
export async function renderStoryCard(post) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')

  const { top, bottom } = pastelBackground(post.hold_color)
  const gradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT)
  gradient.addColorStop(0, top)
  gradient.addColorStop(1, bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  const [photoImg, iconImg, avatarImg] = await Promise.all([
    loadImage(`${api.baseUrl}/media/${post.photo_path}`),
    loadImage('/icon-512.png'),
    // Avatar is optional and shouldn't fail the whole render if it 404s.
    post.user?.avatar_url
      ? loadImage(`${api.baseUrl}${post.user.avatar_url}`).catch(() => null)
      : Promise.resolve(null),
  ])

  // Byline: avatar (or an initial-letter placeholder) + @username, credited
  // above the photo so a shared card always says whose climb it is.
  const avatarSize = 80
  const headerX = 80
  const headerY = 150
  if (avatarImg) {
    drawCoverImage(ctx, avatarImg, headerX, headerY - avatarSize / 2, avatarSize, avatarSize, avatarSize / 2)
  } else {
    ctx.save()
    ctx.beginPath()
    ctx.arc(headerX + avatarSize / 2, headerY, avatarSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#d6d3d1'
    ctx.fill()
    ctx.fillStyle = '#57534e'
    ctx.font = '700 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((post.user?.display_name?.[0] || '?').toUpperCase(), headerX + avatarSize / 2, headerY + 2)
    ctx.restore()
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1c1917'
  ctx.font = '700 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif'
  ctx.fillText(post.user?.display_name ?? '', headerX + avatarSize + 24, headerY)

  const photoBox = { x: 80, y: 280, w: CARD_WIDTH - 160, h: 1180 }
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  drawCoverImage(ctx, photoImg, photoBox.x, photoBox.y, photoBox.w, photoBox.h, 36)
  ctx.restore()

  const gradeLabel =
    post.grade_scale === 'v' ? `V${post.grade_value}` : `Comp ${post.grade_value}`

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1c1917'
  ctx.font = '800 104px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif'
  ctx.fillText(gradeLabel, CARD_WIDTH / 2, photoBox.y + photoBox.h + 150)

  ctx.fillStyle = '#57534e'
  ctx.font = '500 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif'
  ctx.fillText(statusLabel(post), CARD_WIDTH / 2, photoBox.y + photoBox.h + 220)

  // Watermark: the actual app icon (climber-on-mountain, same asset used for the
  // favicon/home-screen icon — see vite.config.js VitePWA manifest) plus a "K2"
  // wordmark in the same bold sans-serif the in-app header uses (Home.jsx h1).
  // Centered, stacked, and small — a corner credit, not a second focal point.
  const iconSize = 90
  const iconX = (CARD_WIDTH - iconSize) / 2
  const iconY = CARD_HEIGHT - iconSize - 130
  drawCoverImage(ctx, iconImg, iconX, iconY, iconSize, iconSize, 20)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1c1917'
  ctx.font = '800 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif'
  ctx.fillText('K2', CARD_WIDTH / 2, iconY + iconSize + 50)

  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
