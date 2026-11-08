// The planner's sync and reminder server (PLAN.md 11, 12.6): a Cloudflare Worker with a D1
// database. GitHub Pages serves the app; this keeps the synced copy and sends the reminders.
// It's also the AI connector (F74): /mcp, with sign-in through the OAuth library.
import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { clearAi, createCode, storeWeeks } from './ai'
import { claim, createInvite, isClaimed, isOwner, requireKey } from './auth'
import { authorize } from './connect'
import { CORS_HEADERS, HttpError, json, readJson, readJsonOrNothing, type Env } from './http'
import { readDiary } from './letterboxd'
import { handleMcp, type ConnectorProps } from './mcp'
import { sendTest, subscribe, unsubscribe, vapidKeys } from './push'
import { runReminders } from './reminders'
import { sync } from './sync'

export type { Env }

async function route(request: Request, env: Env): Promise<Response> {
  const route = `${request.method} ${new URL(request.url).pathname}`
  switch (route) {
    case 'GET /':
      return json({ app: 'planner-sync', version: 3, claimed: await isClaimed(env), connector: !!env.OAUTH_KV })
    case 'GET /push/key':
      return json({ publicKey: (await vapidKeys(env)).publicKey })
    case 'POST /claim':
      await claim(request, env, await readJsonOrNothing(request))
      return json({ claimed: true })
    case 'GET /mcp':
    case 'POST /mcp':
      // Only reached when the connector isn't set up on this server (no OAUTH_KV yet).
      throw new HttpError(503, 'This server needs an update before an AI can connect.')
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
    case 'POST /ai/weeks':
      return json(await storeWeeks(env, space, await readJson(request)))
    case 'POST /ai/code':
      return json(await createCode(env, space))
    case 'POST /ai/off':
      return json(await clearAi(env, space))
  }
  throw new HttpError(404, 'Not found.')
}

/** The app's routes, and the connector's sign-in page. */
async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  try {
    if (new URL(request.url).pathname === '/authorize' && env.OAUTH_PROVIDER) return await authorize(request, env)
    return await route(request, env)
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    // A new server whose database hasn't had its latest migration yet.
    if (error instanceof Error && /no such table/i.test(error.message)) {
      console.error(error)
      return json({ error: 'The server’s database needs an update: run the migrations (npx wrangler d1 migrations apply planner --remote).' }, 503)
    }
    console.error(error)
    return json({ error: 'Something went wrong on the server.' }, 500)
  }
}

// The OAuth library needs its own address up front; the Worker learns it from the first request.
const providers = new Map<string, OAuthProvider<Env>>()

function providerFor(origin: string): OAuthProvider<Env> {
  let provider = providers.get(origin)
  if (!provider) {
    provider = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: {
        fetch: (request, env, ctx) => handleMcp(request, env as Env, (ctx as unknown as { props: ConnectorProps }).props),
      },
      defaultHandler: { fetch: (request, env) => handle(request as unknown as Request, env) },
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      scopesSupported: ['planner'],
      resourceMetadata: { resource: `${origin}/mcp` },
      clientIdMetadataDocumentEnabled: true,
      // Signed in until it goes unused for 90 days, or "Connect an AI" is turned off.
      refreshTokenTTL: 90 * 24 * 60 * 60,
      refreshTokenIdleTTL: 90 * 24 * 60 * 60,
    })
    providers.set(origin, provider)
  }
  return provider
}

export default {
  async fetch(request, env, ctx) {
    // Before the connector's storage is set up, the server works exactly as before.
    if (!env.OAUTH_KV) return handle(request as unknown as Request, env)
    return providerFor(new URL(request.url).origin).fetch(request, env, ctx)
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminders(env, new Date(controller.scheduledTime)))
  },
} satisfies ExportedHandler<Env>
