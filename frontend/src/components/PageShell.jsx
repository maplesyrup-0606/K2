export default function PageShell({ header, children }) {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-0 z-10">
        {header}
      </header>
      {children}
    </div>
  )
}
