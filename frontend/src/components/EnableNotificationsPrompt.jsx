import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { isPushSupported, isIOS, isStandalone, subscribeToPush } from '../lib/push'

const DISMISSED_KEY = 'k2-push-prompt-dismissed'

// One-time per device, not per visit: once the user has made a choice (or
// we've shown it once), never nag again — the Profile page toggle remains
// the permanent manual control either way.
function shouldOffer() {
  try {
    if (localStorage.getItem(DISMISSED_KEY)) return false
  } catch {
    // localStorage unavailable (private mode, blocked) — fall through and
    // just don't persist the dismissal; worst case we ask again next visit.
  }
  if (isIOS() && !isStandalone()) return false // subscribe would just fail
  if (!isPushSupported()) return false
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return false
  return true
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Nothing to do — see shouldOffer's comment.
  }
}

export default function EnableNotificationsPrompt() {
  const [open, setOpen] = useState(() => shouldOffer())
  const [busy, setBusy] = useState(false)

  function dismiss() {
    markDismissed()
    setOpen(false)
  }

  async function enable() {
    setBusy(true)
    await subscribeToPush()
    markDismissed()
    setBusy(false)
    setOpen(false)
  }

  if (!open) return null

  return (
    <Modal maxWidth="max-w-sm">
      <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Turn on notifications?</h2>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        Get notified when someone likes your post, replies, follows you, or invites you to climb.
      </p>
      <div className="mt-5 flex gap-2">
        <Button
          variant="primary"
          onClick={dismiss}
          disabled={busy}
          className="flex-1 !bg-stone-100 dark:!bg-stone-800 !text-stone-700 dark:!text-stone-300 hover:!bg-stone-200 dark:hover:!bg-stone-700"
        >
          Not now
        </Button>
        <Button variant="primary" onClick={enable} disabled={busy} className="flex-1">
          {busy ? 'Enabling…' : 'Enable'}
        </Button>
      </div>
    </Modal>
  )
}
