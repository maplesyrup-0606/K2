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
    return { text: '⚡ Flash', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' }
  }
  if (post.outcome === 'sent') {
    return { text: 'Sent', className: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' }
  }
  if (post.outcome === 'projecting') {
    return { text: 'Project-ing', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' }
  }
  return { text: 'Gave up', className: 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300' }
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
  const [reactorsOpen, setReactorsOpen] = useState(false)
  const [pickedReactorEmoji, setPickedReactorEmoji] = useState(null)
  const isMine = currentUserId === post.user.id

  const badge = outcomeBadge(post)
  const gradeLabel =
    post.grade_scale === 'v' ? `V${post.grade_value}` : `Comp ${post.grade_value}`

  const reactionCounts = post.reaction_counts || {}
  const myReactions = post.my_reactions || []
  const reactors = post.reactors || {}
  const reactedEmojis = Object.keys(reactors)
  const totalReactions = reactedEmojis.reduce(
    (n, e) => n + (reactors[e]?.length || 0),
    0,
  )
  // Always show defaults + any custom emoji that's been used on this post
  const emojiList = Array.from(
    new Set([...DEFAULT_EMOJIS, ...Object.keys(reactionCounts)])
  )

  // The picked tab may no longer have any reactors (someone removed theirs).
  // Fall back to the first available emoji so the panel always shows a list.
  const activeReactorEmoji =
    pickedReactorEmoji && reactedEmojis.includes(pickedReactorEmoji)
      ? pickedReactorEmoji
      : reactedEmojis[0] ?? null

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
    <article className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
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
            className="text-sm font-medium text-stone-900 dark:text-stone-100 hover:underline"
          >
            {post.user.display_name}
          </Link>
          <div className="text-xs text-stone-400 dark:text-stone-500">
            @{post.user.username} ·{' '}
            <Link
              to={`/posts/${post.id}`}
              className="hover:underline hover:text-stone-600"
            >
              {timeAgo(post.climbed_at)}
            </Link>
          </div>
        </div>

        {showActions && isMine && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={deleting}
              className="text-stone-400 dark:text-stone-500 hover:text-stone-700 text-lg px-2 leading-none disabled:opacity-50"
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
                <div className="absolute right-0 top-7 z-20 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-md py-1 min-w-[120px]">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit(post)
                    }}
                    className="block w-full text-left px-3 py-1.5 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="block w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-stone-50 dark:hover:bg-stone-800/50"
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
        loading="lazy"
        className="w-full mt-3 aspect-square object-cover bg-stone-100 dark:bg-stone-800"
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
          <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">
            {post.attempts_bucket} attempts
          </span>
        </div>

        {post.notes && (
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
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
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
                }`}
                aria-label={`React with ${emoji}`}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-xs">{count}</span>}
              </button>
            )
          })}
        </div>

        {totalReactions > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setReactorsOpen((v) => !v)}
              className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
              aria-expanded={reactorsOpen}
            >
              {totalReactions === 1 ? '1 reaction' : `${totalReactions} reactions`}
            </button>

            {reactorsOpen && (
              <div className="mt-2 pt-3 border-t border-stone-100 dark:border-stone-800">
                <div className="flex flex-wrap gap-1.5">
                  {reactedEmojis.map((emoji) => {
                    const active = emoji === activeReactorEmoji
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setPickedReactorEmoji(emoji)}
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${
                          active
                            ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span>{reactors[emoji]?.length || 0}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {(reactors[activeReactorEmoji] || []).map((u) => (
                    <Link
                      key={u.id}
                      to={`/u/${u.username}`}
                      className="flex items-center gap-2 hover:opacity-70 transition"
                    >
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-stone-300 dark:bg-stone-600 text-[10px] flex items-center justify-center">
                          {u.display_name?.[0] ?? '?'}
                        </div>
                      )}
                      <span className="text-xs text-stone-700 dark:text-stone-300">
                        {u.display_name}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
