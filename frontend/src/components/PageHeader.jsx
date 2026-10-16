import { useLocation, useNavigate } from 'react-router-dom'

// Shared header for every sub-page: back chevron left, title centered, an
// optional action on the right. Children replace the title (e.g. a search
// field). Home keeps its own wordmark header but shares HEADER_HEIGHT_CLASS.
export const HEADER_HEIGHT_CLASS = 'h-14'

export default function PageHeader({ title, backTo = '/', right, children }) {
  const navigate = useNavigate()
  const location = useLocation()

  function goBack() {
    // location.key is 'default' for the first history entry (e.g. opened
    // from a push), where navigate(-1) would leave the app.
    if (location.key === 'default') navigate(backTo)
    else navigate(-1)
  }

  return (
    <div className={`max-w-2xl mx-auto px-4 ${HEADER_HEIGHT_CLASS} grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2`}>
      <button
        type="button"
        onClick={goBack}
        aria-label="Back"
        className="inline-flex items-center justify-center w-9 h-9 -ml-2 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      {children ?? (
        <h1 className="text-base font-semibold text-center truncate text-stone-900 dark:text-stone-100">
          {title}
        </h1>
      )}
      <div className="flex justify-end">{right}</div>
    </div>
  )
}
