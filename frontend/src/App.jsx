import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { api } from './api'
import { useAsyncEffect } from './lib/useAsyncEffect'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Profile from './pages/Profile'
import ProjectPage from './pages/ProjectPage'
import PostPage from './pages/PostPage'
import Plans from './pages/Plans'
import People from './pages/People'
import Admin from './pages/Admin'
import Install from './pages/Install'
import BottomNav from './components/BottomNav'

export default function App() {
  // me === undefined: still loading
  // me === null: not logged in
  // me === <object>: logged in
  const [me, setMe] = useState(undefined)

  const refresh = useAsyncEffect(async () => {
    try {
      const { ok, data } = await api.getMe()
      setMe(ok ? data : null)
    } catch {
      setMe(null)
    }
  }, [])

  if (me === undefined) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center text-stone-400 dark:text-stone-500">
        Loading…
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={me ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/onboarding"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : me.is_onboarded ? (
              <Navigate to="/" replace />
            ) : (
              <Onboarding user={me} onComplete={refresh} />
            )
          }
        />
        <Route
          path="/"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : !me.is_onboarded ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Home user={me} onLogout={refresh} />
            )
          }
        />
        <Route
          path="/u/:username"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : !me.is_onboarded ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Profile currentUser={me} onCurrentUserChange={setMe} onLogout={refresh} />
            )
          }
        />
        <Route
          path="/projects/:id"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : !me.is_onboarded ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <ProjectPage currentUser={me} />
            )
          }
        />
        <Route
          path="/posts/:id"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : !me.is_onboarded ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <PostPage currentUser={me} />
            )
          }
        />
        <Route
          path="/people"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : !me.is_onboarded ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <People />
            )
          }
        />
        <Route
          path="/plans"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : !me.is_onboarded ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Plans currentUser={me} />
            )
          }
        />
        <Route
          path="/admin/invites"
          element={
            !me ? (
              <Navigate to="/login" replace />
            ) : !me.is_onboarded ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Admin currentUser={me} />
            )
          }
        />
        <Route path="/install" element={<Install />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {me && me.is_onboarded && <BottomNav currentUser={me} />}
      {import.meta.env.DEV && (
        <div className="fixed top-0 inset-x-0 z-[9999] h-1.5 bg-amber-400 pointer-events-none" />
      )}
    </BrowserRouter>
  )
}
