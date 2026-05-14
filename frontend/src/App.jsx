export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col items-center justify-center p-6">
      <h1 className="text-5xl font-bold tracking-tight">K2</h1>
      <p className="mt-3 text-stone-500">Climbing log — v0 skeleton</p>

      <div className="mt-10 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-stone-500">Sample feed item</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold">V4</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Sent
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-600">3–4 attempts · just now</p>
      </div>

      <button
        type="button"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-stone-900 text-white text-3xl leading-none shadow-lg hover:bg-stone-700 active:scale-95 transition"
        aria-label="New post"
      >
        +
      </button>
    </div>
  )
}
