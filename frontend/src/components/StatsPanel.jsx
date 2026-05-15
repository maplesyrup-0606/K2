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
      <div className="text-[10px] text-stone-500 uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </div>
  )
}

function GradePyramid({ pyramid, prefix, title }) {
  const grades = Object.keys(pyramid)
    .map(Number)
    .sort((a, b) => b - a)

  if (grades.length === 0) return null

  const max = Math.max(...grades.map((g) => pyramid[g]))

  return (
    <div className="mt-5">
      <div className="text-xs text-stone-500 uppercase tracking-wide mb-2">
        {title}
      </div>
      <div className="space-y-1">
        {grades.map((g) => {
          const count = pyramid[g]
          const width = (count / max) * 100
          return (
            <div key={g} className="flex items-center gap-3">
              <div className="w-10 text-xs text-stone-700 font-medium">
                {prefix}
                {g}
              </div>
              <div className="flex-1 bg-stone-100 rounded h-5 overflow-hidden">
                <div
                  className="bg-stone-800 h-full"
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className="w-6 text-xs text-stone-700 text-right">
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

  const hardestVLabel =
    stats?.hardest_v != null ? `V${stats.hardest_v}` : '—'

  const isEmpty =
    !loading &&
    stats &&
    stats.sessions === 0 &&
    stats.total_sends === 0

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5">
      {/* Window selector */}
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium text-stone-700">Stats</div>
        <div className="flex gap-1">
          {WINDOWS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setWindow(key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                window === key
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-stone-400 py-6 text-sm">Loading…</div>
      ) : !stats ? (
        <div className="text-center text-stone-400 py-6 text-sm">
          Couldn't load stats.
        </div>
      ) : isEmpty ? (
        <div className="text-center text-stone-400 py-6 text-sm">
          No climbs in this window.
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            <Stat label="Sessions" value={stats.sessions} />
            <Stat label="Sends" value={stats.total_sends} />
            <Stat label="Flashes" value={stats.flash_count} />
            <Stat label="Hardest" value={hardestVLabel} />
          </div>

          <GradePyramid
            pyramid={stats.v_pyramid}
            prefix="V"
            title="V scale (sends)"
          />
          <GradePyramid
            pyramid={stats.comp_pyramid}
            prefix="Comp "
            title="Comp scale (sends)"
          />
        </>
      )}
    </div>
  )
}
