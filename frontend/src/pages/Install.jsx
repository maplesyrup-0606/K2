import { useState, useEffect } from 'react'
import { api } from '../api'

function getPlatform() {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function IOSInstructions() {
  return (
    <ol className="space-y-4 text-left">
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">1</span>
        <span className="text-stone-300 pt-0.5">Open this page in <strong className="text-white">Safari</strong> (not Chrome or another browser)</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">2</span>
        <span className="text-stone-300 pt-0.5">Tap the <strong className="text-white">Share</strong> button at the bottom of the screen (the box with an arrow pointing up)</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">3</span>
        <span className="text-stone-300 pt-0.5">Scroll down and tap <strong className="text-white">Add to Home Screen</strong></span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">4</span>
        <span className="text-stone-300 pt-0.5">Tap <strong className="text-white">Add</strong> — K2 will appear on your home screen</span>
      </li>
    </ol>
  )
}

function AndroidInstructions() {
  return (
    <ol className="space-y-4 text-left">
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">1</span>
        <span className="text-stone-300 pt-0.5">Open this page in <strong className="text-white">Chrome</strong></span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">2</span>
        <span className="text-stone-300 pt-0.5">Tap the <strong className="text-white">three-dot menu</strong> in the top right</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">3</span>
        <span className="text-stone-300 pt-0.5">Tap <strong className="text-white">Add to Home screen</strong> or <strong className="text-white">Install app</strong></span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">4</span>
        <span className="text-stone-300 pt-0.5">Tap <strong className="text-white">Install</strong> — K2 will appear on your home screen</span>
      </li>
    </ol>
  )
}

function DesktopInstructions() {
  return (
    <ol className="space-y-4 text-left">
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">1</span>
        <span className="text-stone-300 pt-0.5">Open this page in <strong className="text-white">Chrome</strong> or <strong className="text-white">Edge</strong></span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">2</span>
        <span className="text-stone-300 pt-0.5">Look for the <strong className="text-white">install icon</strong> in the address bar (a monitor with a down arrow)</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">3</span>
        <span className="text-stone-300 pt-0.5">Click it and select <strong className="text-white">Install</strong></span>
      </li>
    </ol>
  )
}

export default function Install() {
  const [platform] = useState(getPlatform)
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6">
      <img src="/logo.svg" alt="K2" className="h-10 mb-8" />

      <h1 className="text-2xl font-bold text-white mb-2">You're invited</h1>
      <p className="text-stone-400 mb-10 text-center">Install K2 to your device for the best experience</p>

      <div className="w-full max-w-sm bg-stone-900 rounded-2xl p-6 mb-6">
        {platform === 'ios' && <IOSInstructions />}
        {platform === 'android' && <AndroidInstructions />}
        {platform === 'desktop' && <DesktopInstructions />}
      </div>

      {deferredPrompt && (
        <button
          onClick={handleInstallClick}
          className="w-full max-w-sm bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl mb-4 transition"
        >
          Install K2
        </button>
      )}

      <a
        href={api.loginUrl}
        className="w-full max-w-sm text-center bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium py-3 rounded-xl transition"
      >
        Skip — open in browser
      </a>
    </div>
  )
}
