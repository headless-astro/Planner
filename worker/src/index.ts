// The planner's sync and reminder server (PLAN.md 11, 12.6): a Cloudflare Worker with a D1
// database. GitHub Pages serves the app; this keeps the synced copy and sends the reminders.
import { claim, isClaimed, requireKey } from './auth'
import { CORS_HEADERS, HttpError, json, readJson, type Env } from './http'
import { readDiary } from './letterboxd'
import { sendTest, subscribe, unsubscribe, vapidKeys } from './push'
import { runReminders } from './reminders'
import { sync } from './sync'

export type { Env }

async function route(request: Request, env: Env): Promise<Response> {
  const route = `${request.method} ${new URL(request.url).pathname}`
  switch (route) {
    case 'GET /':
      return json({ app: 'planner-sync', version: 1, claimed: await isClaimed(env) })
    case 'GET /push/key':
      return json({ publicKey: (await vapidKeys(env)).publicKey })
    case 'POST /claim':
      await claim(request, env)
      return json({ claimed: true })
  }

  // Everything else needs the key.
  await requireKey(request, env)
  switch (route) {
    case 'POST /sync':
      return json(await sync(env, await readJson(request)))
    case 'POST /push/subscribe':
      await subscribe(request, env, await readJson(request))
      return json({ subscribed: true })
    case 'POST /push/unsubscribe':
      await unsubscribe(env, await readJson(request))
      return json({ subscribed: false })
    case 'POST /push/test':
      return json({ result: await sendTest(env, await readJson(request)) })
    case 'POST /letterboxd':
      return json(await readDiary(await readJson(request)))
  }
  throw new HttpError(404, 'Not found.')
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
    try {
      return await route(request, env)
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      console.error(error)
      return json({ error: 'Something went wrong on the server.' }, 500)
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminders(env, new Date(controller.scheduledTime)))
  },
} satisfies ExportedHandler<Env>
