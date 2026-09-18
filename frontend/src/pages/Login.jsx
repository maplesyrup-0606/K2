import { useState } from 'react'
import { api } from '../api'
import Button from '../components/Button'
import FormField from '../components/FormField'

const OAuthButton = ({ href, children }) => (
  <a
    href={href}
    className="flex items-center justify-center gap-3 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-6 py-3 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition"
  >
    {children}
  </a>
)

export default function Login() {
  // 'login' | 'signup' | 'forgot-password' | 'pending-verification' | 'reset-sent'
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const resetFormError = () => setError('')

  const handleLogin = async (e) => {
    e.preventDefault()
    resetFormError()
    setSubmitting(true)
    const { ok, status, data } = await api.login(email, password)
    setSubmitting(false)
    if (ok) {
      // No AuthContext — App.jsx re-fetches /api/auth/me on mount, so a full
      // navigation is how the rest of the SPA learns about the new session
      // (mirrors how the Google OAuth redirect flow already works).
      window.location.assign('/')
      return
    }
    if (status === 403 && data?.code === 'unverified') {
      setMode('pending-verification')
      return
    }
    setError(data?.error || 'Invalid email or password')
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    resetFormError()
    if (password !== confirmPassword) {
      setError('Passwords don’t match')
      return
    }
    setSubmitting(true)
    const { ok, data } = await api.signup(email, password, displayName)
    setSubmitting(false)
    if (ok) {
      setMode('pending-verification')
      return
    }
    setError(data?.error || 'Could not create account')
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    resetFormError()
    setSubmitting(true)
    await api.forgotPassword(email)
    setSubmitting(false)
    setMode('reset-sent')
  }

  const handleResend = async () => {
    await api.resendVerification(email)
  }

  if (mode === 'pending-verification') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Check your email</h1>
        <p className="mt-3 text-stone-500 dark:text-stone-400 max-w-xs">
          We sent a verification link to <span className="font-medium">{email}</span>. Click it to finish setting up your account. The link expires in 3 days.
        </p>
        <p className="mt-3 text-xs text-stone-400 dark:text-stone-500 max-w-xs">
          Don't see it? Check your spam or junk folder.
        </p>
        <button
          onClick={handleResend}
          className="mt-6 text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          Resend email
        </button>
        <button
          onClick={() => { setMode('login'); resetFormError() }}
          className="mt-8 text-xs text-stone-400 dark:text-stone-500 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  if (mode === 'reset-sent') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Check your email</h1>
        <p className="mt-3 text-stone-500 dark:text-stone-400 max-w-xs">
          If an account exists for <span className="font-medium">{email}</span>, we sent a link to reset your password. The link expires in 1 hour.
        </p>
        <p className="mt-3 text-xs text-stone-400 dark:text-stone-500 max-w-xs">
          Don't see it? Check your spam or junk folder.
        </p>
        <button
          onClick={() => { setMode('login'); resetFormError() }}
          className="mt-8 text-xs text-stone-400 dark:text-stone-500 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  if (mode === 'forgot-password') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Reset password</h1>
        <form onSubmit={handleForgotPassword} className="mt-8 w-full max-w-xs flex flex-col gap-4">
          <FormField
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
        <button
          onClick={() => { setMode('login'); resetFormError() }}
          className="mt-6 text-xs text-stone-400 dark:text-stone-500 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  const isSignup = mode === 'signup'

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6">
      <h1 className="text-6xl font-bold tracking-tight text-stone-900 dark:text-stone-100">K2</h1>
      <p className="mt-3 text-stone-500 dark:text-stone-400">Climbing log for friends</p>

      <div className="mt-10 w-full max-w-xs flex flex-col gap-3">
        <OAuthButton href={api.loginUrl}>Sign in with Google</OAuthButton>
        {api.appleEnabled && <OAuthButton href={api.appleLoginUrl}>Sign in with Apple</OAuthButton>}
      </div>

      <div className="mt-6 w-full max-w-xs flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
        or
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
      </div>

      <form
        onSubmit={isSignup ? handleSignup : handleLogin}
        className="mt-6 w-full max-w-xs flex flex-col gap-4"
      >
        {isSignup && (
          <FormField
            label="Name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}
        <FormField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isSignup && (
          <FormField
            label="Confirm password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        )}
        {!isSignup && (
          <button
            type="button"
            onClick={() => { setMode('forgot-password'); resetFormError() }}
            className="self-end -mt-2 text-xs text-stone-400 dark:text-stone-500 hover:underline"
          >
            Forgot password?
          </button>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <button
        onClick={() => { setMode(isSignup ? 'login' : 'signup'); resetFormError() }}
        className="mt-6 text-xs text-stone-400 dark:text-stone-500 hover:underline"
      >
        {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>
    </div>
  )
}
