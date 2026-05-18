import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import { api } from '../api'
import PostCard from '../components/PostCard'
import StatsPanel from '../components/StatsPanel'
import ProjectCard from '../components/ProjectCard'
import EditPostModal from './EditPostModal'

export default function Profile({ currentUser }) {
  const { username } = useParams()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [nextOffset, setNextOffset] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectStatus, setProjectStatus] = useState('active')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    const [
      { ok: ok1, data: profileData },
      { ok: ok2, data: postsData },
    ] = await Promise.all([
      api.getUserProfile(username),
      api.listUserPosts(username),
    ])
    setLoading(false)
    if (!ok1 || !ok2) {
      setNotFound(true)
      return
    }
    setProfile(profileData)
    setPosts(postsData.posts)
    setNextOffset(postsData.next_offset)
  }, [username])

  useEffect(() => {
    load()
  }, [load])

  // Fetch projects whenever username or selected status changes
  useEffect(() => {
    let cancelled = false
    setLoadingProjects(true)
    api.listUserProjects(username, projectStatus).then(({ ok, data }) => {
      if (cancelled) return
      setProjects(ok ? data.projects : [])
      setLoadingProjects(false)
    })
    return () => {
      cancelled = true
    }
  }, [username, projectStatus])

  async function loadMore() {
    if (nextOffset == null || loadingMore) return
    setLoadingMore(true)
    const { ok, data } = await api.listUserPosts(username, nextOffset)
    setLoadingMore(false)
    if (!ok) return
    setPosts((prev) => [...prev, ...data.posts])
    setNextOffset(data.next_offset)
  }

  async function handleDelete(postId) {
    const { ok, data } = await api.deletePost(postId)
    if (!ok) {
      window.alert(data?.error || 'Failed to delete')
      return
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  function handleEdit(post) {
    setEditing(post)
  }

  function handleUpdated(updatedPost) {
    setPosts((prev) =>
      prev.map((p) => (p.id === updatedPost.id ? updatedPost : p))
    )
  }

  if (notFound) return <Navigate to="/" replace />

  const isOwnProfile = currentUser && profile && currentUser.id === profile.id

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            K2
          </Link>
          <Link
            to="/"
            className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
          >
            ← Feed
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {loading ? (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        ) : profile ? (
          <>
            {/* Profile header */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 flex items-center gap-4">
              {profile.avatar_url && (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-16 h-16 rounded-full"
                />
              )}
              <div className="flex-1">
                <h1 className="text-xl font-semibold">{profile.display_name}</h1>
                <div className="text-sm text-stone-400 dark:text-stone-500">@{profile.username}</div>
                <div className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                  Joined {new Date(profile.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-6">
              <StatsPanel username={profile.username} />
            </div>

            {/* Projects */}
            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Projects
                </h2>
                <div className="flex gap-1">
                  {[
                    ['active', 'Active'],
                    ['sent', 'Sent'],
                    ['abandoned', 'Abandoned'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProjectStatus(key)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        projectStatus === key
                          ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingProjects ? (
                <div className="text-xs text-stone-400 dark:text-stone-500 text-center py-4">
                  Loading…
                </div>
              ) : projects.length === 0 ? (
                <div className="text-xs text-stone-400 dark:text-stone-500 text-center py-4">
                  No {projectStatus} projects.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              )}
            </div>

            {/* Post list */}
            <div className="mt-6 space-y-6">
              {posts.length === 0 ? (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
                  No posts yet.
                </div>
              ) : (
                posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    currentUserId={currentUser?.id}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onReactionChange={handleUpdated}
                    showActions={isOwnProfile}
                  />
                ))
              )}

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
          </>
        ) : null}
      </main>

      {editing && (
        <EditPostModal
          post={editing}
          onClose={() => setEditing(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}
