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
      className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-lg leading-none p-1"
    >
      {current === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
