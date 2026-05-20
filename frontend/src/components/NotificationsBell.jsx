import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const POLL_INTERVAL_MS = 30_000

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

function messageFor(n) {
  if (n.type === 'reaction') {
    return (
      <>
        reacted {n.emoji || ''} to your post
      </>
    )
  }
  if (n.type === 'plan_join') {
    return <>joined your plan</>
  }
  return <>did something</>
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()
  const mountedRef = useRef(true)

  const fetchNotifications = useCallback(async () => {
    const { ok, data } = await api.listNotifications()
    if (!ok || !mountedRef.current) return
    setNotifications(data.notifications)
    setUnreadCount(data.unread_count)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchNotifications()
    const id = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [fetchNotifications])

  async function handleNotificationClick(n) {
    setOpen(false)
    // Optimistic: mark this one as read locally + decrement unread count
    if (!n.is_read) {
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      api.markNotificationsRead([n.id])
    }
    // Navigate to the relevant page
    if (n.type === 'reaction' && n.post_id) {
      navigate(`/posts/${n.post_id}`)
    } else if (n.type === 'plan_join') {
      navigate('/plans')
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    await api.markNotificationsRead()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-lg leading-none p-1"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-14 sm:top-10 z-20 sm:w-80 max-h-[70vh] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-stone-400 dark:text-stone-500 text-sm">
                  Nothing yet.
                </div>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition ${
                          !n.is_read ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                        }`}
                      >
                        {n.actor.avatar_url ? (
                          <img
                            src={n.actor.avatar_url}
                            alt=""
                            className="w-9 h-9 rounded-full shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-stone-200 dark:bg-stone-700 shrink-0 flex items-center justify-center text-xs">
                            {n.actor.display_name?.[0] ?? '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 leading-snug">
                          <div className="text-sm text-stone-900 dark:text-stone-100">
                            <span className="font-medium">
                              {n.actor.display_name}
                            </span>{' '}
                            <span className="text-stone-600 dark:text-stone-400">
                              {messageFor(n)}
                            </span>
                          </div>
                          <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                            {timeAgo(n.created_at)}
                          </div>
                        </div>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
