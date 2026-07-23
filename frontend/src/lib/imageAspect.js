// Bounds match typical phone camera output (4:3 landscape/portrait) so ordinary
// photos pass through untouched — clamping only kicks in for outlier shots
// (panoramas, full-screen 9:16 video-style), keeping feed card heights sane.
const MIN_RATIO = 3 / 4
const MAX_RATIO = 1.91

export function clampAspectRatio(width, height) {
  if (!width || !height) return 1
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height))
}

export function getImageAspectRatio(file) {
  return new Promise((resolve) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(clampAspectRatio(img.naturalWidth, img.naturalHeight))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(1)
    }
    img.src = url
  })
}
