import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Composer from './Composer'
import PostCard from '../components/PostCard'

export default function Home({ user, onLogout }) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nextOffset, setNextOffset] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadFeed = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { ok, data } = await api.listPosts(0)
    setLoading(false)
    if (!ok) {
      setError(data?.error || 'Failed to load feed')
      return
    }
    setPosts(data.posts)
    setNextOffset(data.next_offset)
  }, [])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  async function loadMore() {
    if (nextOffset == null || loadingMore) return
    setLoadingMore(true)
    const { ok, data } = await api.listPosts(nextOffset)
    setLoadingMore(false)
    if (!ok) return
    setPosts((prev) => [...prev, ...data.posts])
    setNextOffset(data.next_offset)
  }

  async function logout() {
    await api.logout()
    await onLogout()
  }

  function handlePosted(post) {
    // Optimistic: prepend the new post to the top of the feed
    setPosts((prev) => [post, ...prev])
  }

  function handleReactionChange(updatedPost) {
    setPosts((prev) =>
      prev.map((p) => (p.id === updatedPost.id ? updatedPost : p))
    )
  }


  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">K2</h1>
          <div className="flex items-center gap-3">
            <Link
              to={`/u/${user.username}`}
              className="flex items-center gap-3 hover:opacity-70 transition"
            >
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  className="w-8 h-8 rounded-full"
                  alt=""
                />
              )}
              <div className="flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-stone-800">
                  {user.display_name}
                </span>
                <span className="text-xs text-stone-400">@{user.username}</span>
              </div>
            </Link>
            {user.is_admin && (
              <Link
                to="/admin/invites"
                className="text-sm text-stone-500 hover:text-stone-900"
              >
                Admin
              </Link>
            )}
            <button
              onClick={logout}
              className="ml-2 text-sm text-stone-500 hover:text-stone-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading && (
          <div className="text-center text-stone-400 py-12">Loading…</div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold">
              Welcome, {user.display_name.split(' ')[0]}.
            </h2>
            <p className="mt-2 text-stone-500">
              No posts yet — tap the + to log your first climb.
            </p>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <div className="space-y-6">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                currentUserId={user.id}
                onReactionChange={handleReactionChange}
              />
            ))}

            {nextOffset != null && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm text-stone-500 hover:text-stone-900 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-stone-900 text-white text-3xl leading-none shadow-lg hover:bg-stone-700 active:scale-95 transition"
        aria-label="New post"
      >
        +
      </button>

      {composerOpen && (
        <Composer
          user={user}
          onClose={() => setComposerOpen(false)}
          onPosted={handlePosted}
        />
      )}
    </div>
  )
}
