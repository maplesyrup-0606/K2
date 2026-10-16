import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { clampAspectRatio } from '../lib/imageAspect'
import { gradeLabel } from '../lib/sessionFormat'

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

function OutcomeBadge({ post }) {
  if (post.is_flash) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-amber-950" title="Flash">
        <svg {...ICON_PROPS}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" /></svg>
      </span>
    )
  }
  if (post.outcome === 'sent') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400 text-emerald-950" title="Sent">
        <svg {...ICON_PROPS}><path d="m5 12 5 5 9-10" /></svg>
      </span>
    )
  }
  if (post.outcome === 'projecting') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-400 text-sky-950" title="Project-ing">
        <svg {...ICON_PROPS}><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
      </span>
    )
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-stone-700" title="Gave up">
      <svg {...ICON_PROPS}><path d="M5 12h14" /></svg>
    </span>
  )
}

function WallTile({ post }) {
  // Photos keep their own shape; until one loads, hold a portrait slot so the
  // column doesn't jump around more than it has to.
  const [ratio, setRatio] = useState(4 / 5)
  const grade = gradeLabel(post.grade_scale, post.grade_value)
  const reactionTotal = Object.values(post.reaction_counts ?? {}).reduce((sum, n) => sum + n, 0)
  const conversation = reactionTotal + (post.comment_count ?? 0)

  return (
    <Link
      to={`/posts/${post.id}`}
      aria-label={`${grade} climb`}
      className="group relative block overflow-hidden rounded-2xl bg-stone-200 dark:bg-stone-800"
      style={{ aspectRatio: ratio }}
    >
      <img
        src={`${api.baseUrl}/media/${post.photo_path}`}
        alt=""
        loading="lazy"
        onLoad={(e) => setRatio(clampAspectRatio(e.target.naturalWidth, e.target.naturalHeight))}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute right-2 top-2">
        <OutcomeBadge post={post} />
      </div>
      <div className="absolute inset-x-2.5 bottom-2 flex items-end justify-between text-white">
        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-lg font-bold leading-none tracking-tight">{grade}</span>
          {post.hold_color && (
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70"
              style={{ backgroundColor: post.hold_color }}
              aria-hidden="true"
            />
          )}
        </div>
        {conversation > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-white/90">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.6 4.5c2 0 3.6 1.1 5.4 3 1.8-1.9 3.4-3 5.4-3 3.6 0 5.8 3.7 4.2 7.3C19.5 16.4 12 21 12 21Z" />
            </svg>
            {conversation}
          </span>
        )}
      </div>
    </Link>
  )
}

function monthKey(post) {
  return post.climbed_on.slice(0, 7)
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// Every climb as a two-column photo wall, newest first, broken up by month.
// Posts alternate between the columns so the reading order stays roughly
// chronological while each photo keeps its natural proportions.
export default function PhotoWall({ posts }) {
  const months = []
  for (const post of posts) {
    const key = monthKey(post)
    const current = months[months.length - 1]
    if (current && current.key === key) current.posts.push(post)
    else months.push({ key, posts: [post] })
  }

  return (
    <div className="space-y-7">
      {months.map(({ key, posts: monthPosts }) => {
        const columns = [[], []]
        monthPosts.forEach((post, index) => columns[index % 2].push(post))
        return (
          <section key={key} aria-label={monthLabel(key)}>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h3 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                {monthLabel(key)}
              </h3>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {monthPosts.length} {monthPosts.length === 1 ? 'climb' : 'climbs'}
              </span>
            </div>
            <div className="grid grid-cols-2 items-start gap-2.5">
              {columns.map((column, columnIndex) => (
                <div key={columnIndex} className={`space-y-2.5 ${columnIndex === 1 ? 'pt-6' : ''}`}>
                  {column.map((post) => (
                    <WallTile key={post.id} post={post} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
