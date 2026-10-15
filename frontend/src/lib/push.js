import { api } from '../api'

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function urlBase64ToUint8Array(base64) {
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// Reflects whatever the browser actually has, rather than a locally-cached
// flag that can drift (permission revoked outside the app, etc).
export async function getPushSubscriptionState() {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription != null
  } catch {
    return false
  }
}

// Swallows every failure (unsupported, permission denied, network) — a
// user who hasn't installed the PWA or declines the permission prompt
// should just silently stay unsubscribed, not see an error.
export async function subscribeToPush() {
  if (!isPushSupported()) return false
  try {
    const { ok, data } = await api.pushPublicKey()
    if (!ok || !data.public_key) return false

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.public_key),
    })

    const json = subscription.toJSON()
    const res = await api.subscribePush({
      endpoint: json.endpoint,
      keys: json.keys,
    })
    return res.ok
  } catch {
    return false
  }
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return true

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await api.unsubscribePush(endpoint)
    return true
  } catch {
    return false
  }
}
