import { useState } from 'react'
import { api } from '../api'

export default function Onboarding({ user, onComplete }) {
  const [name, setName] = useState(user.display_name || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { ok, data } = await api.updateMe({ display_name: name.trim() })
    setSubmitting(false)
    if (!ok) {
      setError(data?.error || 'Something went wrong')
      return
    }
    await onComplete()
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-2xl border border-stone-200 p-6 shadow-sm"
      >
        <h1 className="text-2xl font-semibold">What's your name?</h1>
        <p className="mt-1 text-sm text-stone-500">
          This is what your friends will see on your posts. You can change it later.
        </p>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          autoFocus
          className="mt-5 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
        />

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="mt-5 w-full bg-stone-900 text-white rounded-lg px-4 py-2 font-medium hover:bg-stone-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
