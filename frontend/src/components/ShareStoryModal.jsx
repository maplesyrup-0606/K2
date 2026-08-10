import { useEffect, useRef, useState } from 'react'
import { renderStoryCard } from '../lib/instagramStory'
import Modal from './Modal'

export default function ShareStoryModal({ post, onClose }) {
  const [status, setStatus] = useState('rendering') // rendering | ready | error
  const [previewUrl, setPreviewUrl] = useState(null)
  const blobRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl = null

    renderStoryCard(post)
      .then((blob) => {
        if (cancelled) return
        blobRef.current = blob
        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [post])

  async function handleShare() {
    const blob = blobRef.current
    if (!blob) return
    const file = new File([blob], 'k2-climb.png', { type: 'image/png' })

    if (shareSupported && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file] })
      } catch (err) {
        // AbortError = user dismissed the native share sheet, not a failure.
        // Anything else (e.g. canShare said yes but share() still refused
        // this file) falls back to a plain download instead of erroring out.
        if (err.name !== 'AbortError') handleDownload()
      }
      return
    }

    handleDownload()
  }

  function handleDownload() {
    if (!previewUrl) return
    const a = document.createElement('a')
    a.href = previewUrl
    a.download = 'k2-climb.png'
    a.click()
  }

  // Label reflects whether the Web Share API exists at all — checking
  // canShare() with a placeholder file here would give an answer that can
  // disagree with the real per-file check in handleShare(), which is what
  // caused the button text to lie about what clicking it would do.
  const shareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Modal maxWidth="max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            Share to Instagram
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="aspect-[9/16] w-full rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
          {status === 'rendering' && (
            <span className="text-sm text-stone-400 dark:text-stone-500">Rendering…</span>
          )}
          {status === 'error' && (
            <span className="text-sm text-red-500 px-4 text-center">
              Couldn't generate the story image.
            </span>
          )}
          {status === 'ready' && previewUrl && (
            <img src={previewUrl} alt="Story preview" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleShare}
            disabled={status !== 'ready'}
            className="w-full rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            Share
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={status !== 'ready'}
            className="w-full rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            Download instead
          </button>
        </div>
    </Modal>
  )
}
