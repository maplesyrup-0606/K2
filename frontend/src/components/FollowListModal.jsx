import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAsyncEffect } from '../lib/useAsyncEffect'
import Modal from './Modal'
import Avatar from './Avatar'

const COPY = {
  followers: { title: 'Followers', empty: 'No followers yet.' },
  following: { title: 'Following', empty: 'Not following anyone yet.' },
}

// `kind` is 'followers' | 'following'. Rows link to the person's profile and
// close the sheet on tap — Profile is the same route element for every
// /u/:username, so it would otherwise stay open across the navigation.
export default function FollowListModal({ username, kind, onClose }) {
  const [users, setUsers] = useState([])
  const [nextOffset, setNextOffset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const fetchPage = kind === 'followers' ? api.listFollowers : api.listUserFollowing

  const loadFirstPage = useAsyncEffect(async () => {
    setLoading(true)
    setError(null)
    const { ok, data } = await fetchPage(username)
    setLoading(false)
    if (!ok) {
      setError(data?.error || 'Could not load this list.')
      return
    }
    setUsers(data.users)
    setNextOffset(data.next_offset)
  }, [username, kind])

  async function loadMore() {
    if (nextOffset == null || loadingMore) return
    setLoadingMore(true)
    setError(null)
    const { ok, data } = await fetchPage(username, nextOffset)
    setLoadingMore(false)
    if (!ok) {
      setError(data?.error || 'Could not load more.')
      return
    }
    setUsers((previous) => [...previous, ...data.users])
    setNextOffset(data.next_offset)
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <Modal
      maxWidth="max-w-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-list-title"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 id="follow-list-title" className="text-xl font-semibold">
          {COPY[kind].title}
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

      {loading ? (
        <div className="py-10 text-center text-sm text-stone-400 dark:text-stone-500">Loading…</div>
      ) : users.length === 0 && !error ? (
        <div className="py-10 text-center text-sm text-stone-400 dark:text-stone-500">
          {COPY[kind].empty}
        </div>
      ) : (
        // The list scrolls on its own so the title and ✕ stay in view — a full
        // page of rows would otherwise push them off-screen on a phone.
        <ul className="max-h-[60vh] overflow-y-auto overscroll-contain divide-y divide-stone-100 dark:divide-stone-800">
          {users.map((user) => (
            <li key={user.id}>
              <Link
                to={`/u/${user.username}`}
                onClick={onClose}
                className="flex items-center gap-3 py-3 hover:opacity-70 transition"
              >
                <Avatar user={user} />
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                    {user.display_name}
                  </span>
                  <span className="text-xs text-stone-400 dark:text-stone-500 truncate">
                    @{user.username}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}{' '}
          <button
            type="button"
            onClick={users.length === 0 ? loadFirstPage : loadMore}
            className="underline"
          >
            Try again
          </button>
        </div>
      )}

      {nextOffset != null && !error && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 w-full py-2 text-sm text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Show more'}
        </button>
      )}
    </Modal>
  )
}
