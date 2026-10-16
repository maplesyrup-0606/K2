import { Link } from 'react-router-dom'
import { api } from '../api'
import {
  formatSessionDate,
  formatShortSessionDate,
  gradeLabel,
  outcomeLabel,
  sessionPath,
} from '../lib/sessionFormat'

function mediaUrl(photoPath) {
  return `${api.baseUrl}/media/${photoPath}`
}

function ClimbCountBadge({ count }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </svg>
      {count}
    </span>
  )
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// One tile in the profile's Sessions grid: the cover photo, the day's
// headline grade, and where/when it happened.
export function SessionTile({ session }) {
  const { headline } = session
  const grade = gradeLabel(headline.grade_scale, headline.grade_value)
  const label = `${grade} ${outcomeLabel(headline)} on ${formatSessionDate(session.date)}, ${plural(session.climb_count, 'climb')}`

  return (
    <Link
      to={sessionPath(session)}
      aria-label={label}
      className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-stone-200 dark:bg-stone-800"
    >
      <img
        src={mediaUrl(session.cover.photo_path)}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/25" />
      <div className="absolute right-1.5 top-1.5">
        <ClimbCountBadge count={session.climb_count} />
      </div>
      <div className="absolute inset-x-2 bottom-2 text-white">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold leading-none tracking-tight">{grade}</span>
          <span className="text-[10px] font-medium text-white/80">{outcomeLabel(headline)}</span>
        </div>
        <div className="mt-1 text-[11px] font-medium leading-tight">{formatShortSessionDate(session.date)}</div>
        {session.gym && (
          <div className="truncate text-[10px] leading-tight text-white/70">{session.gym.name}</div>
        )}
      </div>
    </Link>
  )
}

// One session in the home feed. The cover runs full-bleed with the day's
// headline grade as the loudest thing on it; a strip underneath previews the
// other climbs. The cover and the strip both open the session; the climber
// pill is a sibling link (not nested) so each target stays a valid anchor.
export function SessionFeedCard({ session }) {
  const { headline, user, gym } = session
  const previews = session.preview_photos ?? []
  const grade = gradeLabel(headline.grade_scale, headline.grade_value)
  const href = sessionPath(session)
  const hiddenCount = Math.max(0, session.climb_count - 1 - previews.length)
  const tally = [
    session.send_count > 0 && plural(session.send_count, 'send'),
    session.flash_count > 0 && plural(session.flash_count, 'flash').replace('flashs', 'flashes'),
  ].filter(Boolean).join(', ')

  return (
    <article className="overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div className="relative aspect-[4/5] bg-stone-200 dark:bg-stone-800">
        <img
          src={mediaUrl(session.cover.photo_path)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/30" />

        <Link
          to={href}
          aria-label={`${grade} ${outcomeLabel(headline)} on ${formatSessionDate(session.date)}, ${plural(session.climb_count, 'climb')} by ${user.display_name}`}
          className="absolute inset-0"
        />

        <Link
          to={`/u/${user.username}`}
          className="absolute left-3 top-3 z-10 flex max-w-[70%] items-center gap-2 rounded-full bg-black/40 py-1 pl-1 pr-3 text-white backdrop-blur-md transition hover:bg-black/55"
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="h-7 w-7 rounded-full bg-white/30" />
          )}
          <span className="truncate text-sm font-medium">{user.display_name}</span>
        </Link>
        <div className="pointer-events-none absolute right-3 top-3">
          <ClimbCountBadge count={session.climb_count} />
        </div>

        <div className="pointer-events-none absolute inset-x-5 bottom-5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="whitespace-nowrap text-4xl font-extrabold leading-none tracking-tight">{grade}</span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-md">
              {outcomeLabel(headline)}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold">{formatSessionDate(session.date)}</div>
          {gym && <div className="text-xs text-white/70">{gym.name}</div>}
        </div>
      </div>

      {(previews.length > 0 || tally) && (
        <Link to={href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-stone-800/60">
          <div className="flex items-center gap-1.5">
            {previews.map((photoPath, index) => (
              <img
                key={`${photoPath}-${index}`}
                src={mediaUrl(photoPath)}
                alt=""
                loading="lazy"
                className="h-11 w-11 rounded-lg object-cover bg-stone-200 dark:bg-stone-800"
              />
            ))}
            {hiddenCount > 0 && (
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-stone-100 text-xs font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                +{hiddenCount}
              </span>
            )}
          </div>
          {tally && (
            <span className="ml-auto text-xs font-medium text-stone-500 dark:text-stone-400">{tally}</span>
          )}
        </Link>
      )}
    </article>
  )
}
