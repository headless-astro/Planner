// The planner's sync and reminder server (PLAN.md 11, 12.6): a Cloudflare Worker with a D1
// database. GitHub Pages serves the app; this keeps the synced copy and sends the reminders.
import { claim, createInvite, isClaimed, isOwner, requireKey } from './auth'
import { CORS_HEADERS, HttpError, json, readJson, readJsonOrNothing, type Env } from './http'
import { readDiary } from './letterboxd'
import { sendTest, subscribe, unsubscribe, vapidKeys } from './push'
import { runReminders } from './reminders'
import { sync } from './sync'

export type { Env }

async function route(request: Request, env: Env): Promise<Response> {
  const route = `${request.method} ${new URL(request.url).pathname}`
  switch (route) {
    case 'GET /':
      return json({ app: 'planner-sync', version: 2, claimed: await isClaimed(env) })
    case 'GET /push/key':
      return json({ publicKey: (await vapidKeys(env)).publicKey })
    case 'POST /claim':
      await claim(request, env, await readJsonOrNothing(request))
      return json({ claimed: true })
  }

  // Everything else needs the key, and works in that key's space.
  const space = await requireKey(request, env)
  switch (route) {
    case 'GET /me':
      return json({ owner: await isOwner(env, space) })
    case 'POST /invite':
      return json(await createInvite(env, space))
    case 'POST /sync':
      return json(await sync(env, space, await readJson(request)))
    case 'POST /push/subscribe':
      await subscribe(request, env, space, await readJson(request))
      return json({ subscribed: true })
    case 'POST /push/unsubscribe':
      await unsubscribe(env, space, await readJson(request))
      return json({ subscribed: false })
    case 'POST /push/test':
      return json({ result: await sendTest(env, space, await readJson(request)) })
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
