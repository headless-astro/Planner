// Reminders on this device (PLAN.md 11.5): the browser's push subscription, registered with
// your server. The server only sends an empty ping at your times; the service worker writes
// the notification from the data on the device (see reminderText.ts).
import { getMeta, setMeta } from './repo'
import { fromBase64url, serverCall, SyncError, type SyncConfig } from './sync'

export type ReminderSupport = 'ready' | 'unsupported' | 'blocked' | 'no-worker'

/** Whether this browser can show reminders, and what's in the way if not. */
export async function reminderSupport(): Promise<ReminderSupport> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'blocked'
  // The service worker only runs in the built app, not on the development server.
  return (await navigator.serviceWorker.getRegistration()) ? 'ready' : 'no-worker'
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const found = await navigator.serviceWorker.getRegistration()
  if (!found) throw new SyncError('Reminders work in the installed app, once it has loaded once.')
  return found
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if ((await reminderSupport()) === 'unsupported') return null
  const found = await navigator.serviceWorker.getRegistration()
  return found ? found.pushManager.getSubscription() : null
}

const sameKey = (subscription: PushSubscription, key: Uint8Array) => {
  const current = subscription.options.applicationServerKey
  if (!current) return false
  const bytes = new Uint8Array(current)
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index])
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Asks for notifications, subscribes this browser, and tells the server where to ping. */
export async function turnOnReminders(config: SyncConfig): Promise<void> {
  const worker = await registration()
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new SyncError('Notifications are blocked for this site. Allow them in the browser’s site settings, then try again.')
  }
  const { publicKey } = await serverCall<{ publicKey: string }>(config, '/push/key')
  const key = fromBase64url(publicKey)
  let subscription = await worker.pushManager.getSubscription()
  // A subscription made for another server can't be reused.
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await serverCall(config, '/push/subscribe', { subscription: subscription.toJSON(), timezone: timeZone() })
  await setMeta('remindersRefreshed', Date.now())
}

export async function turnOffReminders(config: SyncConfig | null): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  if (config) await serverCall(config, '/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined)
  await subscription.unsubscribe()
}

/** Pings this device now. Returns the push service's answer as the server saw it. */
export async function sendTestReminder(config: SyncConfig): Promise<'sent' | 'gone' | 'failed'> {
  const subscription = await currentSubscription()
  if (!subscription) throw new SyncError('Reminders aren’t on for this device.')
  return (await serverCall<{ result: 'sent' | 'gone' | 'failed' }>(config, '/push/test', { endpoint: subscription.endpoint })).result
}

/**
 * Once a day, tells the server this device's time zone again, so reminders follow you when you
 * travel. Quietly does nothing when reminders are off or the server can't be reached.
 */
export async function refreshReminders(config: SyncConfig | null): Promise<void> {
  try {
    if (!config || Notification.permission !== 'granted') return
    const last = (await getMeta<number>('remindersRefreshed')) ?? 0
    if (Date.now() - last < 24 * 60 * 60 * 1000) return
    const subscription = await currentSubscription()
    if (!subscription) return
    await serverCall(config, '/push/subscribe', { subscription: subscription.toJSON(), timezone: timeZone() })
    await setMeta('remindersRefreshed', Date.now())
  } catch {
    // Next time.
  }
}
