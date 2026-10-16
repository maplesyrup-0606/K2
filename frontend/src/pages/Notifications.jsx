import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import PageShell from '../components/PageShell'
import PageHeader from '../components/PageHeader'
import { useAsyncEffect } from '../lib/useAsyncEffect'
import { timeAgo, messageFor, destinationFor } from '../lib/notifications'

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [nextOffset, setNextOffset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const loadingMoreRef = useRef(false)
  const navigate = useNavigate()

  useAsyncEffect(async () => {
    const { ok, data } = await api.listNotifications()
    setLoading(false)
    if (!ok) {
      setError(data?.error || 'Failed to load notifications')
      return
    }
    setNotifications(data.notifications)
    setNextOffset(data.next_offset)
  }, [])

  async function loadMore() {
    if (nextOffset == null || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const { ok, data } = await api.listNotifications(nextOffset)
    loadingMoreRef.current = false
    setLoadingMore(false)
    if (!ok) return
    setNotifications((prev) => [...prev, ...data.notifications])
    setNextOffset(data.next_offset)
  }

  function openNotification(notification) {
    if (!notification.is_read) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      )
      api.markNotificationsRead([notification.id])
    }
    const destination = destinationFor(notification)
    if (destination) navigate(destination)
  }

  return (
    <PageShell
      header={
        <PageHeader title="Notifications" />
      }
    >
      <main className="max-w-2xl mx-auto pb-24 sm:pb-6">
        {loading && (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        )}

        {!loading && error && (
          <div className="m-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl p-4 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="py-16 text-center text-stone-400 dark:text-stone-500 text-sm">
            Nothing yet.
          </div>
        )}

        {notifications.length > 0 && (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-stone-100 dark:hover:bg-stone-800/50 transition ${
                    notification.is_read ? '' : 'bg-blue-50 dark:bg-blue-900/30'
                  }`}
                >
                  {notification.actor.avatar_url ? (
                    <img
                      src={notification.actor.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-stone-700 shrink-0 flex items-center justify-center text-sm">
                      {notification.actor.display_name?.[0] ?? '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 leading-snug">
                    <div className="text-sm text-stone-900 dark:text-stone-100">
                      <span className="font-medium">{notification.actor.display_name}</span>{' '}
                      <span className="text-stone-600 dark:text-stone-400">
                        {messageFor(notification)}
                      </span>
                    </div>
                    <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                      {timeAgo(notification.created_at)}
                    </div>
                  </div>
                  {!notification.is_read && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {nextOffset != null && (
          <div className="p-4 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 rounded-full text-sm font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </main>
    </PageShell>
  )
}
