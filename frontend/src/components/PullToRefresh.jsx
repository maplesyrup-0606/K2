import { useEffect, useRef, useState, useCallback } from 'react'

const THRESHOLD = 72

export function usePullToRefresh(onRefresh) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)
  const stableRefresh = useRef(onRefresh)
  stableRefresh.current = onRefresh

  useEffect(() => {
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return

    function onTouchStart(e) {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY
        pulling.current = false
      }
    }

    function onTouchMove(e) {
      if (startY.current === 0) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0 && window.scrollY === 0) {
        pulling.current = true
        setPullY(Math.min(delta * 0.45, THRESHOLD))
        // prevent native scroll bounce interfering
        if (delta > 10) e.preventDefault()
      }
    }

    function onTouchEnd() {
      if (!pulling.current) return
      const captured = pullY
      setPullY(0)
      startY.current = 0
      pulling.current = false
      if (captured >= THRESHOLD * 0.75) {
        setRefreshing(true)
        Promise.resolve(stableRefresh.current()).finally(() => setRefreshing(false))
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [pullY])

  const indicator = (
    <div
      className="pointer-events-none flex justify-center overflow-hidden transition-all duration-150"
      style={{ height: refreshing ? 44 : pullY > 0 ? pullY : 0 }}
    >
      <div
        className={`mt-2 w-7 h-7 rounded-full border-2 border-stone-300 dark:border-stone-600 border-t-stone-700 dark:border-t-stone-300 ${
          refreshing ? 'animate-spin' : ''
        }`}
        style={{
          opacity: refreshing ? 1 : Math.min(pullY / (THRESHOLD * 0.75), 1),
          transform: refreshing ? undefined : `rotate(${(pullY / THRESHOLD) * 180}deg)`,
        }}
      />
    </div>
  )

  return { indicator, refreshing }
}
