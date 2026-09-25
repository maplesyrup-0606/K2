import { useState } from 'react'
import { api } from '../api'
import { useAsyncEffect } from '../lib/useAsyncEffect'
import FormField from './FormField'
import Button from './Button'
import Avatar from './Avatar'

export default function AdminManager({ currentUser }) {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [identifier, setIdentifier] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [addedName, setAddedName] = useState(null)

  useAsyncEffect(async () => {
    setLoading(true)
    const { ok, data } = await api.listAdmins()
    setLoading(false)
    if (ok) setAdmins(data.admins)
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = identifier.trim()
    if (!trimmed || submitting) return
    if (
      !window.confirm(
        `Give "${trimmed}" admin access? They'll be able to manage gyms and other admins.`
      )
    )
      return
    setError(null)
    setAddedName(null)
    setSubmitting(true)
    const { ok, data } = await api.addAdmin(trimmed)
    setSubmitting(false)
    if (!ok) {
      setError(data?.error || 'Failed to add admin')
      return
    }
    setAdmins((previous) => [...previous, data])
    setAddedName(data.display_name)
    setIdentifier('')
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold">Admins</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
        Admins can manage gyms and add other admins.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4"
      >
        <div className="flex items-start gap-2">
          <FormField
            className="flex-1 min-w-0"
            label="Add an admin"
            hint="Their email, @username, or user id — they must already have a K2 account."
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="friend@example.com or @username"
            maxLength={255}
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value)
              if (error) setError(null)
              if (addedName) setAddedName(null)
            }}
          />
          <Button
            type="submit"
            disabled={submitting || !identifier.trim()}
            className="mt-5 shrink-0 text-sm"
          >
            {submitting ? 'Adding…' : 'Make admin'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {addedName && (
          <p role="status" className="mt-3 text-sm text-violet-600 dark:text-violet-400">
            {addedName} is now an admin.
          </p>
        )}
      </form>

      <div className="mt-4">
        {loading ? (
          <div className="text-center text-stone-400 dark:text-stone-500 py-8 text-sm">
            Loading…
          </div>
        ) : (
          <ul className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl divide-y divide-stone-200 dark:divide-stone-800">
            {admins.map((admin) => (
              <li key={admin.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar user={admin} />
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                    {admin.display_name}
                    {admin.id === currentUser.id && (
                      <span className="ml-2 text-xs font-normal text-stone-400 dark:text-stone-500">
                        You
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-stone-400 dark:text-stone-500 truncate">
                    @{admin.username} · {admin.email}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
