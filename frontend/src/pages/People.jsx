import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

const DEBOUNCE_MS = 250

export default function People() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  // Guards against stale responses arriving out of order
  const requestIdRef = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      requestIdRef.current += 1
      setResults([])
      setSearched(false)
      return
    }
    const requestId = ++requestIdRef.current
    const timer = setTimeout(async () => {
      const { ok, data } = await api.searchUsers(q)
      if (!ok || requestId !== requestIdRef.current) return
      setResults(data.users)
      setSearched(true)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            K2
          </Link>
          <input
            type="search"
            autoComplete="off"
            placeholder="Search climbers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600"
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {!query.trim() ? (
          <div className="py-16 text-center text-stone-400 dark:text-stone-500 text-sm">
            Search for climbers by name or username.
          </div>
        ) : results.length === 0 && searched ? (
          <div className="py-16 text-center text-stone-400 dark:text-stone-500 text-sm">
            No one found.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {results.map((u) => (
              <li key={u.id}>
                <Link
                  to={`/u/${u.username}`}
                  className="flex items-center gap-3 py-3 hover:opacity-70 transition"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full shrink-0 bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-stone-500 dark:text-stone-400 font-medium">
                      {u.display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                      {u.display_name}
                    </span>
                    <span className="text-xs text-stone-400 dark:text-stone-500">
                      @{u.username}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
