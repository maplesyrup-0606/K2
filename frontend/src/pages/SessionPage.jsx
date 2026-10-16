import { useState } from 'react'
import { Link, useParams, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import PostCard from '../components/PostCard'
import PageShell from '../components/PageShell'
import { formatSessionDate, gradeLabel, outcomeLabel } from '../lib/sessionFormat'
import Composer from './Composer'
import { useAsyncEffect } from '../lib/useAsyncEffect'

function Total({ value, label }) {
  return (
    <div>
      <div className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{value}</div>
      <div className="text-xs text-stone-500 dark:text-stone-400">{label}</div>
    </div>
  )
}

export default function SessionPage({ currentUser }) {
  const { username, date } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(null)
  const [coverBusy, setCoverBusy] = useState(false)

  const reload = useAsyncEffect(async () => {
    const { ok, data } = await api.getUserSession(username, date)
    setLoading(false)
    if (!ok) {
      setNotFound(true)
      return
    }
    setSession(data)
  }, [username, date])

  if (notFound) return <Navigate to={`/u/${username}`} replace />

  const isMine = currentUser && session && session.user.id === currentUser.id

  function replacePost(updated) {
    setSession((prev) => ({
      ...prev,
      posts: prev.posts.map((p) => (p.id === updated.id ? updated : p)),
    }))
  }

  async function handleDelete(postId) {
    const { ok, data } = await api.deletePost(postId)
    if (!ok) {
      window.alert(data?.error || 'Failed to delete')
      return
    }
    if (session.posts.length === 1) {
      navigate(`/u/${username}`, { replace: true })
      return
    }
    // Totals, hardest send and default cover all change — let the server redo them.
    reload()
  }

  async function chooseCover(postId) {
    if (coverBusy) return
    setCoverBusy(true)
    const { ok } = await api.setSessionCover(date, postId)
    setCoverBusy(false)
    if (ok) reload()
  }

  return (
    <PageShell
      header={
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to={`/u/${username}`}
            className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
          >
            ← @{username}
          </Link>
          <span className="text-sm font-medium text-stone-900 dark:text-stone-100">Session</span>
          <span className="w-12" aria-hidden="true" />
        </div>
      }
    >
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {loading || !session ? (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              {formatSessionDate(session.date)}
            </h1>
            {session.gym && (
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                {session.gym.name}
                {session.gym.city && (
                  <span className="text-stone-400 dark:text-stone-500">
                    {' '}in {session.gym.city}{session.gym.country ? `, ${session.gym.country}` : ''}
                  </span>
                )}
              </p>
            )}

            <section
              aria-label="Session results"
              className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              {session.hardest_sent ? (
                <div className="flex items-center gap-4">
                  <span className="text-5xl font-bold leading-none tracking-tight text-stone-900 dark:text-stone-100">
                    {gradeLabel(session.hardest_sent.grade_scale, session.hardest_sent.grade_value)}
                  </span>
                  <div className="leading-tight">
                    <div className="text-sm font-medium text-stone-700 dark:text-stone-300">Hardest sent</div>
                    <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                      {outcomeLabel(session.hardest_sent)}
                      {session.hardest_sent.attempts_bucket !== '1' &&
                        ` in ${session.hardest_sent.attempts_bucket} attempts`}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-stone-500 dark:text-stone-400">No sends this session.</div>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4 dark:border-stone-800">
                <Total value={session.climb_count} label="Total climbs" />
                <Total value={session.send_count} label="Sends" />
                <Total value={session.flash_count} label="Flashes" />
              </div>
            </section>
            <p className="mt-2 px-1 text-xs text-stone-400 dark:text-stone-500">
              Sends include flashes. Projects don&apos;t count toward hardest sent.
            </p>

            <div className="mt-7 mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">All climbs</h2>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {session.climb_count} {session.climb_count === 1 ? 'climb' : 'climbs'} in one session
              </span>
            </div>

            <div className="space-y-6">
              {session.posts.map((post) => {
                const isCover = session.cover.post_id === post.id
                const isPinned = isCover && session.cover.is_chosen
                return (
                  <div key={post.id}>
                    <PostCard
                      post={post}
                      currentUserId={currentUser?.id}
                      onDelete={handleDelete}
                      onEdit={setEditing}
                      onReactionChange={replacePost}
                      showActions={isMine}
                    />
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => chooseCover(isPinned ? null : post.id)}
                        disabled={coverBusy}
                        aria-pressed={isPinned}
                        className="mt-2 ml-1 text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-100"
                      >
                        {isPinned
                          ? 'Session cover. Tap to reset'
                          : isCover
                            ? 'Default cover. Tap to pin'
                            : 'Use as session cover'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">That&apos;s the whole session.</p>
              <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">
                {session.climb_count} {session.climb_count === 1 ? 'climb' : 'climbs'} logged. Every try counts.
              </p>
              <Link
                to={`/u/${username}`}
                className="mt-4 block rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Back to {session.user.display_name.split(' ')[0]}&apos;s sessions
              </Link>
            </div>
          </>
        )}
      </main>

      {editing && (
        <Composer
          post={editing}
          onClose={() => setEditing(null)}
          onUpdated={(updated) => {
            replacePost(updated)
            reload()
          }}
        />
      )}
    </PageShell>
  )
}
