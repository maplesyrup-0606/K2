// Bottom-right circular "+" action button, shared by Home (new post) and Plans (new plan).
export default function FabButton({ onClick, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-20 sm:bottom-6 right-6 h-14 w-14 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-lg shadow-stone-900/30 dark:shadow-black/50 hover:bg-stone-700 dark:hover:bg-stone-300 active:scale-90 transition-all duration-150 z-30 flex items-center justify-center"
      aria-label={ariaLabel}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  )
}
