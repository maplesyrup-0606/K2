import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import PlanCard from '../components/PlanCard'
import PlanComposer from './PlanComposer'
import EditPlanModal from './EditPlanModal'
import { usePullToRefresh } from '../components/PullToRefresh'

function dayKey(iso) {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function dayLabel(iso) {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  // Within the week, just show the day name; further out, include the date
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'long' })
  }
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Plans({ currentUser }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await api.listPlans()
    setLoading(false)
    if (!ok) return
    setPlans(data.plans)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { indicator: pullIndicator } = usePullToRefresh(load)

  function handleCreated(plan) {
    // Insert in chronological order
    setPlans((prev) => {
      const next = [...prev, plan]
      next.sort(
        (a, b) => new Date(a.planned_at) - new Date(b.planned_at)
      )
      return next
    })
  }

  function handlePlanChange(updatedPlan) {
    setPlans((prev) =>
      prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p))
    )
  }

  async function handleDeletePlan(plan) {
    const { ok, data } = await api.deletePlan(plan.id)
    if (!ok) {
      window.alert(data?.error || 'Failed to cancel plan')
      return
    }
    setPlans((prev) => prev.filter((p) => p.id !== plan.id))
  }

  function handleEditPlan(plan) {
    setEditing(plan)
  }

  function handlePlanUpdated(updatedPlan) {
    setPlans((prev) => {
      const next = prev.map((p) =>
        p.id === updatedPlan.id ? updatedPlan : p
      )
      next.sort(
        (a, b) => new Date(a.planned_at) - new Date(b.planned_at)
      )
      return next
    })
  }

  // Group by day (insertion order preserved since plans are sorted by time)
  const groups = []
  const groupIndex = {}
  for (const p of plans) {
    const key = dayKey(p.planned_at)
    if (!(key in groupIndex)) {
      groupIndex[key] = groups.length
      groups.push({ key, label: dayLabel(p.planned_at), plans: [] })
    }
    groups[groupIndex[key]].plans.push(p)
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            K2
          </Link>
          <Link to="/" className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100">
            ← Feed
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {pullIndicator}
        <h1 className="text-2xl font-semibold">Who's going this week</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          Post a plan to coordinate sessions with friends.
        </p>

        {loading ? (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="mt-6 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 text-center">
            <p className="text-stone-500 dark:text-stone-400">
              No plans yet for the next week.
            </p>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
              Tap + to be the first.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {groups.map((g) => (
              <div key={g.key}>
                <h2 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
                  {g.label}
                </h2>
                <div className="space-y-3">
                  {g.plans.map((p) => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      currentUserId={currentUser?.id}
                      onChange={handlePlanChange}
                      onEdit={handleEditPlan}
                      onDelete={handleDeletePlan}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="fixed bottom-20 sm:bottom-6 right-6 h-14 w-14 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-3xl leading-none shadow-lg hover:bg-stone-700 dark:hover:bg-stone-300 active:scale-95 transition z-30"
        aria-label="New plan"
      >
        +
      </button>

      {composerOpen && (
        <PlanComposer
          onClose={() => setComposerOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editing && (
        <EditPlanModal
          plan={editing}
          onClose={() => setEditing(null)}
          onUpdated={handlePlanUpdated}
        />
      )}
    </div>
  )
}
