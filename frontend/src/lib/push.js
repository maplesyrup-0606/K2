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
// should just silently stay unsubscribed, not see an error. Still logs to
// the console so a real bug doesn't disappear without a trace.
export async function subscribeToPush() {
  if (!isPushSupported()) return false
  try {
    // Must be the first awaited call after the click, with nothing before
    // it — Safari/WebKit treats the permission prompt as tied to the
    // original user gesture and silently fails pushManager.subscribe() if
    // an earlier await (e.g. a network round-trip) already spent it.
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

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
  } catch (err) {
    console.error('[push] subscribe failed:', err)
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
  } catch (err) {
    console.error('[push] unsubscribe failed:', err)
    return false
  }
}
