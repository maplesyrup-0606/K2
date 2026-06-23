import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'

export default function Admin({ currentUser }) {
  // ─── Invites ──────────────────────────────────────────────────────────────
  const [invites, setInvites] = useState([])
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [submittingEmail, setSubmittingEmail] = useState(false)
  const [emailError, setEmailError] = useState(null)

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true)
    const { ok, data } = await api.listInvites()
    setLoadingInvites(false)
    if (ok) setInvites(data.invites)
  }, [])

  useEffect(() => {
    loadInvites()
  }, [loadInvites])

  async function handleAddInvite(e) {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    setEmailError(null)
    setSubmittingEmail(true)
    const { ok, data } = await api.addInvite(email)
    setSubmittingEmail(false)
    if (!ok) {
      setEmailError(data?.error || 'Failed to add')
      return
    }
    setNewEmail('')
    loadInvites()
  }

  async function handleRemoveInvite(email) {
    if (!window.confirm(`Remove ${email} from the allowlist?`)) return
    const { ok, data } = await api.removeInvite(email)
    if (!ok) {
      window.alert(data?.error || 'Failed to remove')
      return
    }
    setInvites((prev) => prev.filter((i) => i.email !== email))
  }

  // ─── Gyms ─────────────────────────────────────────────────────────────────
  const [gyms, setGyms] = useState([])
  const [loadingGyms, setLoadingGyms] = useState(true)
  const [newGymName, setNewGymName] = useState('')
  const [newGymCity, setNewGymCity] = useState('')
  const [newGymCountry, setNewGymCountry] = useState('')
  const [submittingGym, setSubmittingGym] = useState(false)
  const [gymError, setGymError] = useState(null)
  const [editingGymId, setEditingGymId] = useState(null)
  const [editGymName, setEditGymName] = useState('')
  const [editGymCity, setEditGymCity] = useState('')
  const [editGymCountry, setEditGymCountry] = useState('')

  const loadGyms = useCallback(async () => {
    setLoadingGyms(true)
    const { ok, data } = await api.listGyms()
    setLoadingGyms(false)
    if (ok) setGyms(data.gyms)
  }, [])

  useEffect(() => {
    loadGyms()
  }, [loadGyms])

  async function handleAddGym(e) {
    e.preventDefault()
    const name = newGymName.trim()
    if (!name) return
    setGymError(null)
    setSubmittingGym(true)
    const { ok, data } = await api.addGym({
      name,
      city: newGymCity.trim() || undefined,
      country: newGymCountry.trim() || undefined,
    })
    setSubmittingGym(false)
    if (!ok) {
      setGymError(data?.error || 'Failed to add gym')
      return
    }
    setNewGymName('')
    setNewGymCity('')
    setNewGymCountry('')
    loadGyms()
  }

  function startEditGym(gym) {
    setEditingGymId(gym.id)
    setEditGymName(gym.name)
    setEditGymCity(gym.city || '')
    setEditGymCountry(gym.country || '')
  }

  async function saveEditGym(id) {
    const name = editGymName.trim()
    if (!name) return
    const { ok, data } = await api.updateGym(id, {
      name,
      city: editGymCity.trim() || null,
      country: editGymCountry.trim() || null,
    })
    if (!ok) {
      window.alert(data?.error || 'Failed to save')
      return
    }
    setGyms((prev) => prev.map((g) => (g.id === id ? data : g)))
    setEditingGymId(null)
    setEditGymName('')
    setEditGymCity('')
    setEditGymCountry('')
  }

  async function handleRemoveGym(gym) {
    if (
      !window.confirm(
        `Remove "${gym.name}"? It must not be referenced by any plans.`
      )
    )
      return
    const { ok, data } = await api.removeGym(gym.id)
    if (!ok) {
      window.alert(data?.error || 'Failed to remove')
      return
    }
    setGyms((prev) => prev.filter((g) => g.id !== gym.id))
  }

  // Non-admins should never see this page
  if (!currentUser?.is_admin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            K2
          </Link>
          <Link to="/" className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100">
            ← Feed
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6 space-y-10">
        {/* ─── Invites ─── */}
        <section>
          <h1 className="text-2xl font-semibold">Invite allowlist</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Emails listed here can sign in via Google. Anyone else gets a 403.
          </p>

          <form
            onSubmit={handleAddInvite}
            className="mt-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 flex gap-2"
          >
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="friend@example.com"
              className="flex-1 px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
              required
            />
            <button
              type="submit"
              disabled={submittingEmail || !newEmail.trim()}
              className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50"
            >
              {submittingEmail ? 'Adding…' : 'Add'}
            </button>
          </form>
          {emailError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{emailError}</p>
          )}

          <div className="mt-4">
            {loadingInvites ? (
              <div className="text-center text-stone-400 dark:text-stone-500 py-8 text-sm">
                Loading…
              </div>
            ) : invites.length === 0 ? (
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
                No invites yet.
              </div>
            ) : (
              <ul className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl divide-y divide-stone-200 dark:divide-stone-800">
                {invites.map((inv) => (
                  <li
                    key={inv.email}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                        {inv.email}
                      </div>
                      <div className="text-xs text-stone-400 dark:text-stone-500">
                        Added {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveInvite(inv.email)}
                      className="text-xs text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ─── Gyms ─── */}
        <section>
          <h2 className="text-2xl font-semibold">Gyms</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            The list of gyms users can pick when creating a plan.
          </p>

          <form
            onSubmit={handleAddGym}
            className="mt-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 flex flex-col gap-2"
          >
            <input
              type="text"
              value={newGymName}
              onChange={(e) => setNewGymName(e.target.value)}
              placeholder="Gym name"
              maxLength={120}
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
              required
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newGymCity}
                onChange={(e) => setNewGymCity(e.target.value)}
                placeholder="City"
                maxLength={120}
                className="flex-1 px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
              <input
                type="text"
                value={newGymCountry}
                onChange={(e) => setNewGymCountry(e.target.value)}
                placeholder="Country"
                maxLength={120}
                className="flex-1 px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
              <button
                type="submit"
                disabled={submittingGym || !newGymName.trim()}
                className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50"
              >
                {submittingGym ? 'Adding…' : 'Add'}
              </button>
            </div>
          </form>
          {gymError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{gymError}</p>}

          <div className="mt-4">
            {loadingGyms ? (
              <div className="text-center text-stone-400 dark:text-stone-500 py-8 text-sm">
                Loading…
              </div>
            ) : gyms.length === 0 ? (
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
                No gyms yet.
              </div>
            ) : (
              <ul className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl divide-y divide-stone-200 dark:divide-stone-800">
                {gyms.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    {editingGymId === g.id ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <input
                          type="text"
                          value={editGymName}
                          onChange={(e) => setEditGymName(e.target.value)}
                          maxLength={120}
                          className="w-full px-3 py-1.5 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editGymCity}
                            onChange={(e) => setEditGymCity(e.target.value)}
                            placeholder="City"
                            maxLength={120}
                            className="flex-1 px-3 py-1.5 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                          />
                          <input
                            type="text"
                            value={editGymCountry}
                            onChange={(e) => setEditGymCountry(e.target.value)}
                            placeholder="Country"
                            maxLength={120}
                            className="flex-1 px-3 py-1.5 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                          />
                          <button
                            type="button"
                            onClick={() => saveEditGym(g.id)}
                            className="text-xs px-3 py-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:bg-stone-700 dark:hover:bg-stone-300"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGymId(null)
                              setEditGymName('')
                              setEditGymCity('')
                              setEditGymCountry('')
                            }}
                            className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                            {g.name}
                          </div>
                          <div className="text-xs text-stone-400 dark:text-stone-500">
                            {g.city && <span>{g.city}{g.country ? `, ${g.country}` : ''} · </span>}
                            Added {new Date(g.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => startEditGym(g)}
                            className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveGym(g)}
                            className="text-xs text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
