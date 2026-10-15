import { useEffect, useState } from 'react'
import { getStoredTheme, setStoredTheme, resolveTheme } from '../theme'

export default function ThemeToggle() {
  const [current, setCurrent] = useState(resolveTheme())

  // React to system-preference changes if the user hasn't picked a manual one
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (!getStoredTheme()) setCurrent(resolveTheme())
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function toggle() {
    const next = current === 'dark' ? 'light' : 'dark'
    setStoredTheme(next)
    setCurrent(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${current === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${current === 'dark' ? 'light' : 'dark'} mode`}
      className="inline-flex items-center justify-center w-9 h-9 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
    >
      {current === 'dark' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
