import { api } from '../api'

export default function Login() {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6">
      <h1 className="text-6xl font-bold tracking-tight">K2</h1>
      <p className="mt-3 text-stone-500">Climbing log for friends</p>

      <a
        href={api.loginUrl}
        className="mt-12 inline-flex items-center gap-3 bg-stone-900 text-white rounded-lg px-6 py-3 font-medium hover:bg-stone-700 transition"
      >
        <span>Sign in with Google</span>
      </a>

      <p className="mt-8 text-xs text-stone-400">
        Invite-only. Ask the admin to add your email.
      </p>
    </div>
  )
}
