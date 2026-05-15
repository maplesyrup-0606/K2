import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

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

function outcomeBadge(post) {
  if (post.is_flash) {
    return { text: '⚡ Flash', className: 'bg-amber-100 text-amber-700' }
  }
  if (post.outcome === 'sent') {
    return { text: 'Sent', className: 'bg-emerald-100 text-emerald-700' }
  }
  if (post.outcome === 'projecting') {
    return { text: 'Project-ing', className: 'bg-blue-100 text-blue-700' }
  }
  return { text: 'Gave up', className: 'bg-stone-100 text-stone-700' }
}

const DEFAULT_EMOJIS = ['🔥', '💪', '👏', '😱', '😂']

export default function PostCard({
  post,
  currentUserId,
  onDelete,
  onEdit,
  onReactionChange,
  showActions = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reactingEmoji, setReactingEmoji] = useState(null)
  const isMine = currentUserId === post.user.id

  const badge = outcomeBadge(post)
  const gradeLabel =
    post.grade_scale === 'v' ? `V${post.grade_value}` : `Comp ${post.grade_value}`

  const reactionCounts = post.reaction_counts || {}
  const myReactions = post.my_reactions || []
  // Always show defaults + any custom emoji that's been used on this post
  const emojiList = Array.from(
    new Set([...DEFAULT_EMOJIS, ...Object.keys(reactionCounts)])
  )

  async function handleDelete() {
    setMenuOpen(false)
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setDeleting(true)
    await onDelete(post.id)
    // Parent removes from feed → this component unmounts
  }

  async function handleReact(emoji) {
    if (reactingEmoji || !onReactionChange) return
    setReactingEmoji(emoji)
    const alreadyMine = myReactions.includes(emoji)
    const { ok, data } = alreadyMine
      ? await api.removeReaction(post.id, emoji)
      : await api.addReaction(post.id, emoji)
    setReactingEmoji(null)
    if (ok) onReactionChange(data)
  }

  return (
    <article className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <Link to={`/u/${post.user.username}`}>
          {post.user.avatar_url && (
            <img
              src={post.user.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full hover:opacity-80 transition"
            />
          )}
        </Link>
        <div className="flex-1 leading-tight">
          <Link
            to={`/u/${post.user.username}`}
            className="text-sm font-medium text-stone-900 hover:underline"
          >
            {post.user.display_name}
          </Link>
          <div className="text-xs text-stone-400">
            @{post.user.username} · {timeAgo(post.climbed_at)}
          </div>
        </div>

        {showActions && isMine && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={deleting}
              className="text-stone-400 hover:text-stone-700 text-lg px-2 leading-none disabled:opacity-50"
              aria-label="Post options"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                {/* invisible backdrop to catch outside clicks */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-7 z-20 bg-white border border-stone-200 rounded-lg shadow-md py-1 min-w-[120px]">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit(post)
                    }}
                    className="block w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-stone-50"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Photo */}
      <img
        src={`${api.baseUrl}/media/${post.photo_path}`}
        alt=""
        className="w-full mt-3 aspect-square object-cover bg-stone-100"
      />

      {/* Meta */}
      <div className="px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">{gradeLabel}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.text}
          </span>
          <span className="ml-auto text-xs text-stone-500">
            {post.attempts_bucket} attempts
          </span>
        </div>

        {post.notes && (
          <p className="mt-2 text-sm text-stone-700 whitespace-pre-wrap">
            {post.notes}
          </p>
        )}

        {/* Reactions */}
        <div className="mt-3 flex flex-wrap gap-2">
          {emojiList.map((emoji) => {
            const count = reactionCounts[emoji] || 0
            const mine = myReactions.includes(emoji)
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => handleReact(emoji)}
                disabled={reactingEmoji === emoji}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition disabled:opacity-50 ${
                  mine
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
                aria-label={`React with ${emoji}`}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-xs">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </article>
  )
}
