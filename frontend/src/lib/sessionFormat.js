// A session date arrives as a plain 'YYYY-MM-DD' (the climber's local day).
// Build the Date from its parts: `new Date('2026-10-14')` parses as UTC and
// would render as the 13th for anyone west of Greenwich.
function parseSessionDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatSessionDate(isoDate) {
  return parseSessionDate(isoDate).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatShortSessionDate(isoDate) {
  return parseSessionDate(isoDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function gradeLabel(scale, value) {
  return scale === 'v' ? `V${value}` : `C${value}`
}

export function outcomeLabel({ outcome, is_flash: isFlash }) {
  if (isFlash) return 'Flash'
  if (outcome === 'sent') return 'Sent'
  if (outcome === 'projecting') return 'Project-ing'
  return 'Gave up'
}

export function sessionPath(session) {
  return `/u/${session.user.username}/sessions/${session.date}`
}
