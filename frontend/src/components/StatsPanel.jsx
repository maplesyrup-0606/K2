import { useEffect, useState } from 'react'
import { api } from '../api'

const WINDOWS = [
  ['30d', '30d'],
  ['90d', '90d'],
  ['1y', '1y'],
  ['all', 'All'],
]

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </div>
  )
}

// Each entry: [hue, sat-light, light-light, sat-dark, light-dark]
// Light mode: medium-dark so bars pop against the pale stone-100 track.
// Dark mode: brighter so bars pop against the deep stone-950 track.
const V_PALETTE = [
  [215, 34, 48, 40, 64], // V0 — steel blue
  [200, 30, 46, 36, 62], // V1
  [183, 28, 45, 34, 61], // V2 — teal
  [165, 26, 43, 32, 59], // V3
  [148, 24, 42, 30, 58], // V4 — muted green
  [38,  36, 47, 42, 63], // V5 — amber
  [26,  36, 46, 42, 62], // V6 — orange
  [14,  38, 45, 44, 61], // V7
  [4,   38, 45, 44, 61], // V8 — red
  [350, 36, 45, 42, 61], // V9 — rose
]
const COMP_PALETTE = [
  [215, 34, 48, 40, 64], // C1 — blue
  [165, 26, 43, 32, 59], // C2 — teal-green
  [38,  36, 47, 42, 63], // C3 — amber
  [350, 36, 45, 42, 61], // C4 — rose
]

function gradeColor(grade, scale, isDark) {
  const palette = scale === 'v' ? V_PALETTE : COMP_PALETTE
  const idx = scale === 'v'
    ? Math.min(grade, palette.length - 1)
    : Math.min(grade - 1, palette.length - 1)
  const [h, sl, ll, sd, ld] = palette[idx]
  return isDark ? `hsl(${h},${sd}%,${ld}%)` : `hsl(${h},${sl}%,${ll}%)`
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

function GradePyramid({ pyramid, prefix, title, scale, isDark }) {
  const grades = Object.keys(pyramid)
    .map(Number)
    .sort((a, b) => b - a)

  if (grades.length === 0) return null

  const max = Math.max(...grades.map((g) => pyramid[g]))

  return (
    <div className="mt-5">
      <div className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
        {title}
      </div>
      <div className="space-y-1">
        {grades.map((g) => {
          const count = pyramid[g]
          const width = (count / max) * 100
          const color = gradeColor(g, scale, isDark)
          return (
            <div key={g} className="flex items-center gap-3">
              <div className="w-10 text-xs text-stone-700 dark:text-stone-300 font-medium">
                {prefix}{g}
              </div>
              <div className="flex-1 bg-stone-100 dark:bg-stone-950 rounded h-5 overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{ width: `${width}%`, backgroundColor: color }}
                />
              </div>
              <div className="w-6 text-xs text-stone-700 dark:text-stone-300 text-right">
                {count}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StatsPanel({ username }) {
  const isDark = useDarkMode()
  const [stats, setStats] = useState(null)
  const [window, setWindow] = useState('30d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getUserStats(username, window).then(({ ok, data }) => {
      if (cancelled) return
      if (ok) setStats(data)
      else setStats(null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [username, window])

  let hardestLabel = '—'
  if (stats?.hardest_v != null) {
    hardestLabel = `V${stats.hardest_v}`
  } else if (stats?.hardest_comp != null) {
    hardestLabel = `Comp ${stats.hardest_comp}`
  }

  const isEmpty =
    !loading &&
    stats &&
    stats.sessions === 0 &&
    stats.total_sends === 0

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5">
      {/* Window selector */}
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium text-stone-700 dark:text-stone-300">Stats</div>
        <div className="flex gap-1">
          {WINDOWS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setWindow(key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                window === key
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-stone-400 dark:text-stone-500 py-6 text-sm">Loading…</div>
      ) : !stats ? (
        <div className="text-center text-stone-400 dark:text-stone-500 py-6 text-sm">
          Couldn't load stats.
        </div>
      ) : isEmpty ? (
        <div className="text-center text-stone-400 dark:text-stone-500 py-6 text-sm">
          No climbs in this window.
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            <Stat label="Sessions" value={stats.sessions} />
            <Stat label="Sends" value={stats.total_sends} />
            <Stat label="Flashes" value={stats.flash_count} />
            <Stat label="Hardest sent" value={hardestLabel} />
          </div>

          <GradePyramid
            pyramid={stats.v_pyramid}
            prefix="V"
            title="V scale (sends)"
            scale="v"
            isDark={isDark}
          />
          <GradePyramid
            pyramid={stats.comp_pyramid}
            prefix="Comp "
            title="Comp scale (sends)"
            scale="comp"
            isDark={isDark}
          />
        </>
      )}
    </div>
  )
}
