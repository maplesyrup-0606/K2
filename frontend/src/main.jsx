import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { applyTheme } from './theme'

// Apply the saved (or system) theme before React mounts so there's no flash
applyTheme()

// Explicit registration (replaces the plugin's auto-injected <script>) so
// lib/push.js has a real ServiceWorkerRegistration to call
// pushManager.subscribe() against via navigator.serviceWorker.ready.
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
