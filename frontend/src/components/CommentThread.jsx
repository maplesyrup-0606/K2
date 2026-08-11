import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAsyncEffect } from '../lib/useAsyncEffect'

function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString()
}

function Avatar({ user }) {
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full shrink-0" />
  ) : (
    <div className="w-7 h-7 rounded-full shrink-0 bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-stone-500 dark:text-stone-400 text-xs font-medium">
      {user.display_name?.[0]?.toUpperCase() || '?'}
    </div>
  )
}

// postId/currentUserId identify the thread; onCommentCountChange(delta) is an
// optional callback so an embedding page (PostPage) can keep the post's own
// comment_count (shown elsewhere, e.g. PostCard) in sync as comments are
// added/removed here — same "callback reports the delta" convention as
// PostCard's onReactionChange, just additive rather than replace-whole-object
// since this thread doesn't own the post.
export default function CommentThread({ postId, currentUserId, onCommentCountChange }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [replyTarget, setReplyTarget] = useState(null) // { commentId, username }
  const [editingId, setEditingId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [busyId, setBusyId] = useState(null)

  useAsyncEffect(async () => {
    setLoading(true)
    setError(null)
    const { ok, data } = await api.listComments(postId)
    setLoading(false)
    if (!ok) {
      setError(data?.error || 'Failed to load comments')
      return
    }
    setComments(data.comments)
  }, [postId])

  async function handleSubmit(e) {
    e.preventDefault()
    const body = newBody.trim()
    if (!body || posting) return
    setPosting(true)
    const { ok, data } = await api.addComment(postId, body, replyTarget?.commentId ?? null)
    setPosting(false)
    if (!ok) return

    if (replyTarget) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === data.parent_id ? { ...c, replies: [...c.replies, data] } : c
        )
      )
    } else {
      setComments((prev) => [...prev, { ...data, replies: [] }])
    }
    setNewBody('')
    setReplyTarget(null)
    onCommentCountChange?.(1)
  }

  function startEdit(comment) {
    setEditingId(comment.id)
    setEditBody(comment.body)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBody('')
  }

  async function saveEdit(comment, isReply, parentId) {
    const body = editBody.trim()
    if (!body || busyId) return
    setBusyId(comment.id)
    const { ok, data } = await api.updateComment(comment.id, body)
    setBusyId(null)
    if (!ok) return
    setComments((prev) =>
      isReply
        ? prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: c.replies.map((r) => (r.id === data.id ? data : r)) }
              : c
          )
        : prev.map((c) => (c.id === data.id ? { ...data, replies: c.replies } : c))
    )
    cancelEdit()
  }

  async function handleDelete(comment, isReply, parentId) {
    if (busyId) return
    if (!window.confirm('Delete this comment? This cannot be undone.')) return
    setBusyId(comment.id)
    const { ok } = await api.deleteComment(comment.id)
    setBusyId(null)
    if (!ok) return
    const removedCount = isReply ? 1 : 1 + (comment.replies?.length || 0)
    setComments((prev) =>
      isReply
        ? prev.map((c) =>
            c.id === parentId ? { ...c, replies: c.replies.filter((r) => r.id !== comment.id) } : c
          )
        : prev.filter((c) => c.id !== comment.id)
    )
    onCommentCountChange?.(-removedCount)
  }

  function renderRow(comment, { isReply, parentId }) {
    const isMine = comment.user.id === currentUserId
    const isEditing = editingId === comment.id
    const isBusy = busyId === comment.id

    return (
      <div key={comment.id} className={`flex gap-2.5 ${isReply ? 'ml-9 mt-3' : ''}`}>
        <Avatar user={comment.user} />
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <Link
              to={`/u/${comment.user.username}`}
              className="font-medium text-stone-900 dark:text-stone-100 hover:underline"
            >
              {comment.user.display_name}
            </Link>
          </div>

          {isEditing ? (
            <div className="mt-1">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full text-sm rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600"
              />
              <div className="mt-1 flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => saveEdit(comment, isReply, parentId)}
                  disabled={isBusy || !editBody.trim()}
                  className="font-medium text-stone-900 dark:text-stone-100 hover:underline disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-stone-500 dark:text-stone-400 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
              {comment.reply_to_user && (
                <Link
                  to={`/u/${comment.reply_to_user.username}`}
                  className="font-semibold text-stone-900 dark:text-stone-100 hover:underline"
                >
                  @{comment.reply_to_user.username}{' '}
                </Link>
              )}
              {comment.body}
            </p>
          )}

          {!isEditing && (
            <div className="mt-1 flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
              <span>
                {timeAgo(comment.created_at)}
                {comment.edited_at && ' · edited'}
              </span>
              <button
                type="button"
                onClick={() =>
                  setReplyTarget({ commentId: comment.id, username: comment.user.username })
                }
                className="hover:text-stone-700 dark:hover:text-stone-200 font-medium"
              >
                Reply
              </button>
              {isMine && (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit(comment)}
                    className="hover:text-stone-700 dark:hover:text-stone-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(comment, isReply, parentId)}
                    disabled={isBusy}
                    className="hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">Comments</h2>

      {loading && (
        <div className="text-center text-stone-400 dark:text-stone-500 py-6 text-sm">Loading…</div>
      )}
      {!loading && error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {comments.length === 0 && (
            <div className="text-sm text-stone-400 dark:text-stone-500">No comments yet.</div>
          )}
          {comments.map((c) => (
            <div key={c.id}>
              {renderRow(c, { isReply: false, parentId: null })}
              {c.replies.map((r) => renderRow(r, { isReply: true, parentId: c.id }))}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4">
        {replyTarget && (
          <div className="mb-1.5 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            <span>Replying to @{replyTarget.username}</span>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200"
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder={replyTarget ? `Reply to @${replyTarget.username}…` : 'Add a comment…'}
            rows={1}
            maxLength={500}
            className="flex-1 text-sm rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 px-3 py-2 outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 resize-none"
          />
          <button
            type="submit"
            disabled={posting || !newBody.trim()}
            className="shrink-0 text-sm font-medium text-stone-900 dark:text-stone-100 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-70 transition px-1"
          >
            Post
          </button>
        </div>
      </form>
    </div>
  )
}
