import { useState } from 'react'
import { Link, useParams, useNavigate, Navigate } from 'react-router-dom'
import { api } from '../api'
import PostCard from '../components/PostCard'
import { useAsyncEffect } from '../lib/useAsyncEffect'
import PageShell from '../components/PageShell'

function statusBadge(project) {
  if (project.is_expired && project.status === 'active') {
    return { text: 'Stale', className: 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400' }
  }
  if (project.status === 'active') {
    return { text: 'Active', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' }
  }
  if (project.status === 'sent') {
    return { text: '✓ Sent', className: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' }
  }
  return { text: 'Abandoned', className: 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300' }
}

export default function ProjectPage({ currentUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [updating, setUpdating] = useState(false)

  useAsyncEffect(async () => {
    setLoading(true)
    const { ok, data } = await api.getProject(id)
    setLoading(false)
    if (!ok) {
      setNotFound(true)
      return
    }
    setProject(data)
  }, [id])

  async function setStatus(newStatus) {
    setUpdating(true)
    const { ok, data } = await api.updateProject(project.id, {
      status: newStatus,
    })
    setUpdating(false)
    if (!ok) {
      window.alert(data?.error || 'Failed to update')
      return
    }
    setProject(data)
  }

  async function handleDelete() {
    if (
      !window.confirm(
        'Delete this project? Linked posts will keep existing but be unlinked.'
      )
    )
      return
    const { ok, data } = await api.deleteProject(project.id)
    if (!ok) {
      window.alert(data?.error || 'Failed to delete')
      return
    }
    navigate('/')
  }

  async function handlePostUpdated(updatedPost) {
    setProject((prev) => ({
      ...prev,
      posts: prev.posts.map((p) =>
        p.id === updatedPost.id ? updatedPost : p
      ),
    }))
  }

  async function handlePostDelete(postId) {
    const { ok, data } = await api.deletePost(postId)
    if (!ok) {
      window.alert(data?.error || 'Failed to delete')
      return
    }
    setProject((prev) => ({
      ...prev,
      posts: prev.posts.filter((p) => p.id !== postId),
    }))
  }

  if (notFound) return <Navigate to="/" replace />

  const isOwner = project && currentUser && project.user_id === currentUser.id
  const badge = project ? statusBadge(project) : null
  const gradeLabel = project
    ? project.grade_scale === 'v'
      ? `V${project.grade_value}`
      : `Comp ${project.grade_value}`
    : ''

  return (
    <PageShell
      header={
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            K2
          </Link>
          <Link to="/" className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100">
            ← Feed
          </Link>
        </div>
      }
    >
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {loading ? (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        ) : project ? (
          <>
            {/* Project header card */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
              <div className="aspect-square bg-stone-100 dark:bg-stone-800">
                <img
                  src={`${api.baseUrl}/media/${project.photo_path}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                      {project.title}
                    </h1>
                    <div className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                      {gradeLabel} ·{' '}
                      <Link
                        to={`/u/${project.user_id}`}
                        className="hover:underline"
                      >
                        owner
                      </Link>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-4 mt-5">
                  <div>
                    <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{project.sessions}</div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                      Sessions
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                      {project.attempts_lower_bound}+
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                      Attempts
                    </div>
                  </div>
                </div>

                {/* Owner actions */}
                {isOwner && (
                  <div className="mt-5 pt-4 border-t border-stone-100 dark:border-stone-800 flex flex-wrap gap-2">
                    {project.status === 'active' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setStatus('sent')}
                          disabled={updating}
                          className="flex-1 min-w-[120px] bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 transition disabled:opacity-50"
                        >
                          ✓ Mark as sent
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus('abandoned')}
                          disabled={updating}
                          className="flex-1 min-w-[120px] bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50"
                        >
                          Abandon
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStatus('active')}
                        disabled={updating}
                        className="flex-1 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50"
                      >
                        Re-open
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="text-xs text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 px-2"
                    >
                      Delete project
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Linked posts */}
            <div className="mt-6">
              <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
                Sessions ({project.posts.length})
              </h2>
              {project.posts.length === 0 ? (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
                  No linked posts yet.
                </div>
              ) : (
                <div className="space-y-6">
                  {project.posts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      currentUserId={currentUser?.id}
                      onDelete={handlePostDelete}
                      onReactionChange={handlePostUpdated}
                      showActions={isOwner}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </PageShell>
  )
}
