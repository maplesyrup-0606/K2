import { useCallback, useEffect } from 'react'

// Runs an async callback once on mount (and whenever its deps change),
// and returns the stable callback so callers can also invoke it manually
// (e.g. as a pull-to-refresh handler or a post-mutation refetch).
export function useAsyncEffect(fn, deps) {
  // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps -- fn/deps are forwarded verbatim from each call site's own literal
  const load = useCallback(fn, deps)

  useEffect(() => {
    load()
  }, [load])

  return load
}
