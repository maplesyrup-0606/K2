import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Composer from './Composer'
import { SessionFeedCard } from '../components/SessionCards'
import FabButton from '../components/FabButton'
import NotificationsBell from '../components/NotificationsBell'
import ThemeToggle from '../components/ThemeToggle'
import { usePullToRefresh } from '../components/PullToRefresh'
import { useAsyncEffect } from '../lib/useAsyncEffect'
import PageShell from '../components/PageShell'
import { HEADER_HEIGHT_CLASS } from '../components/PageHeader'

export default function Home({ user, onLogout }) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [feed, setFeed] = useState('all')
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nextOffset, setNextOffset] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // Guards against a stale response (e.g. a since-abandoned tab switch)
  // landing after a newer one and clobbering the current view.
  const requestIdRef = useRef(0)

  const loadFeed = useAsyncEffect(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    const { ok, data } = await api.listFeedSessions(0, 20, feed)
    if (requestId !== requestIdRef.current) return
    setLoading(false)
    if (!ok) {
      setError(data?.error || 'Failed to load feed')
      return
    }
    setSessions(data.sessions)
    setNextOffset(data.next_offset)
  }, [feed])

  const { indicator: pullIndicator } = usePullToRefresh(loadFeed)

  async function loadMore() {
    if (nextOffset == null || loadingMore) return
    const requestId = ++requestIdRef.current
    setLoadingMore(true)
    const { ok, data } = await api.listFeedSessions(nextOffset, 20, feed)
    setLoadingMore(false)
    if (requestId !== requestIdRef.current) return
    if (!ok) return
    setSessions((prev) => [...prev, ...data.sessions])
    setNextOffset(data.next_offset)
  }

  async function logout() {
    await api.logout()
    await onLogout()
  }

  // A new climb can change its session's totals, hardest send and cover, so
  // re-fetch rather than splice it in.
  function handlePosted() {
    loadFeed()
  }

  return (
    <PageShell
      header={
        <div className={`max-w-2xl mx-auto px-4 ${HEADER_HEIGHT_CLASS} flex items-center justify-between gap-2`}>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">K2</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/plans"
              className="hidden sm:inline text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
            >
              Plans
            </Link>
            <Link
              to="/people"
              className="inline-flex items-center justify-center w-9 h-9 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              aria-label="Search climbers"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </Link>
            <NotificationsBell />
            <ThemeToggle />
            {user.is_admin && (
              <Link
                to="/admin/invites"
                className="hidden sm:inline text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              >
                Admin
              </Link>
            )}
            <Link
              to={`/u/${user.username}`}
              className="flex items-center gap-2 hover:opacity-70 transition"
            >
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  className="w-8 h-8 rounded-full"
                  alt=""
                />
              )}
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  {user.display_name}
                </span>
                <span className="text-xs text-stone-400 dark:text-stone-500">@{user.username}</span>
              </div>
            </Link>
            <button
              onClick={logout}
              className="hidden sm:inline text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              aria-label="Log out"
            >
              Logout
            </button>
          </div>
        </div>
      }
    >
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {pullIndicator}

        <div className="flex gap-1 mb-4">
          {[
            ['all', 'Everyone'],
            ['following', 'Following'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFeed(key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                feed === key
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        )}

        {!loading && error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl p-4 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && feed === 'all' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold">
              Welcome, {user.display_name.split(' ')[0]}.
            </h2>
            <p className="mt-2 text-stone-500 dark:text-stone-400">
              No sessions yet. Tap the + to log your first climb.
            </p>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && feed === 'following' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold">Nobody to show yet.</h2>
            <p className="mt-2 text-stone-500 dark:text-stone-400">
              Not following anyone yet —{' '}
              <Link to="/people" className="text-stone-900 dark:text-stone-100 underline">
                search for climbers to follow
              </Link>.
            </p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="space-y-6">
            {sessions.map((session) => (
              <SessionFeedCard key={`${session.user.id}-${session.date}`} session={session} />
            ))}

            {nextOffset != null && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <FabButton onClick={() => setComposerOpen(true)} ariaLabel="New post" />

      {composerOpen && (
        <Composer
          onClose={() => setComposerOpen(false)}
          onPosted={handlePosted}
        />
      )}
    </PageShell>
  )
}
