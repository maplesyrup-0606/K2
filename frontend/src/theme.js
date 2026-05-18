// Theme management — light / dark, with system default and localStorage persistence.

const STORAGE_KEY = 'k2-theme'

export function getStoredTheme() {
  // 'light' | 'dark' | null (= follow system)
  return localStorage.getItem(STORAGE_KEY)
}

export function setStoredTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    localStorage.setItem(STORAGE_KEY, theme)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
  applyTheme()
}

export function resolveTheme() {
  const stored = getStoredTheme()
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme() {
  const t = resolveTheme()
  document.documentElement.classList.toggle('dark', t === 'dark')
}
