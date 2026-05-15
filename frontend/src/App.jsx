import { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { api } from './api'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Profile from './pages/Profile'
import ProjectPage from './pages/ProjectPage'
import Admin from './pages/Admin'

export default function App() {
  // me === undefined: still loading
  // me === null: not logged in
  // me === <object>: logged in
  const [me, setMe] = useState(undefined)

  const refresh = useCallback(async () => {
    try {
      const { ok, data } = await api.getMe()
      setMe(ok ? data : null)
    } catch {
      setMe(null)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (me === undefined) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-400">
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
              <Profile currentUser={me} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
