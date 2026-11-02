/// <reference lib="webworker" />
// The service worker: caches the app so it opens offline, and shows the reminders (PLAN.md 11.5).
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'
import { reminderKind, reminderText } from './lib/reminderText'
import { getReminders } from './lib/repo'

declare let self: ServiceWorkerGlobalScope

// Take over straight away, so a new version applies on the next load.
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Every screen lives in index.html (#/ links), so serve it from the cache when offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// A reminder ping from your server carries no text: the reminder is written from the data
// on this device, so it never passes through the push service.
self.addEventListener('push', (event) => {
  event.waitUntil(showReminder())
})

async function showReminder(): Promise<void> {
  let text = { title: 'Planner', body: 'Open the app to see your day.' }
  try {
    text = await reminderText(reminderKind(await getReminders(), new Date()))
  } catch (error) {
    console.error(error)
  }
  await self.registration.showNotification(text.title, { body: text.body, icon: 'icon-192.png', tag: 'planner-reminder' })
}

// Tapping a reminder opens Today, in the app's window if it's already open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openToday())
})

async function openToday(): Promise<void> {
  const url = new URL('./#/today', self.registration.scope).href
  const [open] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (!open) {
    await self.clients.openWindow(url)
    return
  }
  await open.focus()
  await open.navigate(url).catch(() => undefined)
}
