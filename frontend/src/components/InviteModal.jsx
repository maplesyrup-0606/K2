import { useEffect, useState } from 'react'
import { api } from '../api'
import Modal from './Modal'
import FormField from './FormField'
import Button from './Button'

// A focused input on a phone summons the keyboard over a bottom sheet, so
// only auto-focus where there's a physical keyboard.
const HAS_TOUCH_KEYBOARD =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export default function InviteModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sentTo, setSentTo] = useState(null)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || sending) return
    setError(null)
    setSending(true)
    const { ok, data } = await api.inviteByEmail(trimmed)
    setSending(false)
    if (!ok) {
      setError(data?.error || 'Could not send the invite. Try again.')
      return
    }
    setSentTo(trimmed)
    setEmail('')
  }

  return (
    <Modal
      maxWidth="max-w-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
    >
      {sentTo ? (
        <div role="status" className="flex flex-col items-center text-center py-2">
          <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h2 id="invite-title" className="mt-4 text-xl font-semibold">
            Invite sent
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400 break-all">
            We emailed <span className="font-medium text-stone-700 dark:text-stone-300">{sentTo}</span> a
            link to join K2.
          </p>
          <Button type="button" onClick={onClose} className="mt-6 w-full">
            Done
          </Button>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            Invite someone else
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between mb-1">
            <h2 id="invite-title" className="text-xl font-semibold">
              Invite a friend
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
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
            Climb better together. We'll email them a link to join K2, from you.
          </p>

          <FormField
            label="Their email"
            hint="They'll get one email with your name on it."
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="friend@example.com"
            maxLength={255}
            required
            autoFocus={!HAS_TOUCH_KEYBOARD}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (error) setError(null)
            }}
          />

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" disabled={sending || !email.trim()} className="mt-5 w-full">
            {sending ? 'Sending…' : 'Send invite'}
          </Button>
        </form>
      )}
    </Modal>
  )
}
