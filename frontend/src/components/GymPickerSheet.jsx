import { useState, useEffect, useRef } from 'react'

export default function GymPickerSheet({ gyms, gymId, onSelect, open, onClose }) {
  const [search, setSearch] = useState('')
  const [mounted, setMounted] = useState(open)
  const inputRef = useRef(null)

  // Keep mounted during open; unmount after close animation so iOS releases scroll tracking
  useEffect(() => {
    if (open) {
      setMounted(true)
      setSearch('')
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      const t = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!mounted) return null

  const filtered = gyms.filter((g) => {
    const q = search.toLowerCase()
    return (
      g.name.toLowerCase().includes(q) ||
      (g.city && g.city.toLowerCase().includes(q)) ||
      (g.country && g.country.toLowerCase().includes(q))
    )
  })

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col justify-end transition-all duration-200 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        className={`relative bg-white dark:bg-stone-900 rounded-t-2xl flex flex-col shadow-xl max-h-[70vh] transition-transform duration-200 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-stone-300 dark:bg-stone-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 shrink-0">
          <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Select gym</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 shrink-0">
          <input
            ref={inputRef}
            type="search"
            placeholder="Search gyms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 pb-6">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">
              No gyms found
            </div>
          ) : (
            filtered.map((g) => {
              const selected = String(g.id) === gymId
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { onSelect(String(g.id)); onClose() }}
                  className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors ${
                    selected ? 'bg-stone-50 dark:bg-stone-800' : ''
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{g.name}</div>
                    {g.city && (
                      <div className="text-xs text-stone-400 dark:text-stone-500">
                        {g.city}{g.country ? `, ${g.country}` : ''}
                      </div>
                    )}
                  </div>
                  {selected && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-stone-900 dark:text-stone-100 shrink-0 ml-3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
