import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'

const POLL_INTERVAL_MS = 30_000

export default function NotificationsBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const mountedRef = useRef(true)
  // Re-fetch on navigation so the badge drops after reading on the page.
  const { pathname } = useLocation()

  const fetchUnreadCount = useCallback(async () => {
    const { ok, data } = await api.listNotifications(0, 1)
    if (!ok || !mountedRef.current) return
    setUnreadCount(data.unread_count)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchUnreadCount()
    const id = setInterval(fetchUnreadCount, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [fetchUnreadCount, pathname])

  return (
    <Link
      to="/notifications"
      className="relative inline-flex items-center justify-center w-9 h-9 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  )
}
