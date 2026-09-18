import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAsyncEffect } from '../lib/useAsyncEffect'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  // 'checking' | 'ok' | 'error'
  const [status, setStatus] = useState('checking')

  useAsyncEffect(async () => {
    if (!token) {
      setStatus('error')
      return
    }
    const { ok } = await api.verifyEmail(token)
    setStatus(ok ? 'ok' : 'error')
  }, [token])

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
      {status === 'checking' && (
        <p className="text-stone-400 dark:text-stone-500">Verifying…</p>
      )}
      {status === 'ok' && (
        <>
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Email verified</h1>
          <p className="mt-3 text-stone-500 dark:text-stone-400">You can sign in now.</p>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Link expired</h1>
          <p className="mt-3 text-stone-500 dark:text-stone-400 max-w-xs">
            This verification link is invalid or has expired. Sign in and request a new one.
          </p>
        </>
      )}
      {status !== 'checking' && (
        <Link to="/login" className="mt-8 text-sm text-violet-600 dark:text-violet-400 hover:underline">
          Back to sign in
        </Link>
      )}
    </div>
  )
}
