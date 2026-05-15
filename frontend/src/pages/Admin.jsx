import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'

export default function Admin({ currentUser }) {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await api.listInvites()
    setLoading(false)
    if (ok) setInvites(data.invites)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    setError(null)
    setSubmitting(true)
    const { ok, data } = await api.addInvite(email)
    setSubmitting(false)
    if (!ok) {
      setError(data?.error || 'Failed to add')
      return
    }
    setNewEmail('')
    // refresh the list so the new entry shows up
    load()
  }

  async function handleRemove(email) {
    if (!window.confirm(`Remove ${email} from the allowlist?`)) return
    const { ok, data } = await api.removeInvite(email)
    if (!ok) {
      window.alert(data?.error || 'Failed to remove')
      return
    }
    setInvites((prev) => prev.filter((i) => i.email !== email))
  }

  // Non-admins should never see this page
  if (!currentUser?.is_admin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            K2
          </Link>
          <Link to="/" className="text-sm text-stone-500 hover:text-stone-900">
            ← Feed
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold">Invite allowlist</h1>
        <p className="text-sm text-stone-500 mt-1">
          Emails listed here can sign in via Google. Anyone else gets a 403.
        </p>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="mt-6 bg-white border border-stone-200 rounded-2xl p-4 flex gap-2"
        >
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="friend@example.com"
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
            required
          />
          <button
            type="submit"
            disabled={submitting || !newEmail.trim()}
            className="bg-stone-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-stone-700 transition disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}

        {/* List */}
        <div className="mt-6">
          {loading ? (
            <div className="text-center text-stone-400 py-8 text-sm">Loading…</div>
          ) : invites.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center text-stone-500 text-sm">
              No invites yet.
            </div>
          ) : (
            <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-200">
              {invites.map((inv) => (
                <li
                  key={inv.email}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-stone-900">
                      {inv.email}
                    </div>
                    <div className="text-xs text-stone-400">
                      Added {new Date(inv.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(inv.email)}
                    className="text-xs text-stone-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
