import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import Button from '../components/Button'
import FormField from '../components/FormField'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Passwords don’t match')
      return
    }
    setSubmitting(true)
    const { ok, data } = await api.resetPassword(token, newPassword)
    setSubmitting(false)
    if (ok) {
      setDone(true)
      return
    }
    setError(data?.error || 'This link is invalid or has expired')
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Invalid link</h1>
        <Link to="/login" className="mt-8 text-sm text-violet-600 dark:text-violet-400 hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Password updated</h1>
        <p className="mt-3 text-stone-500 dark:text-stone-400">You can sign in with your new password now.</p>
        <Link to="/login" className="mt-8 text-sm text-violet-600 dark:text-violet-400 hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Reset password</h1>
      <form onSubmit={handleSubmit} className="mt-8 w-full max-w-xs flex flex-col gap-4">
        <FormField
          label="New password"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <FormField
          label="Confirm new password"
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </div>
  )
}
