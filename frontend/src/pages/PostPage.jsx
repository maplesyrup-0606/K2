import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, useNavigate, Navigate } from 'react-router-dom'
import { api } from '../api'
import PostCard from '../components/PostCard'
import EditPostModal from './EditPostModal'

export default function PostPage({ currentUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await api.getPost(id)
    setLoading(false)
    if (!ok) {
      setNotFound(true)
      return
    }
    setPost(data)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(postId) {
    const { ok, data } = await api.deletePost(postId)
    if (!ok) {
      window.alert(data?.error || 'Failed to delete')
      return
    }
    // Post is gone — navigate to the feed
    navigate('/')
  }

  function handleEdit(p) {
    setEditing(p)
  }

  function handleUpdated(updatedPost) {
    setPost(updatedPost)
  }

  if (notFound) return <Navigate to="/" replace />

  const isMine = post && currentUser && post.user.id === currentUser.id

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

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {loading ? (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        ) : post ? (
          <PostCard
            post={post}
            currentUserId={currentUser?.id}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onReactionChange={handleUpdated}
            showActions={isMine}
          />
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
