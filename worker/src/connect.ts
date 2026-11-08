// The connector's sign-in page (F74): when an AI asks to connect, you type the code the app
// shows (Settings → AI analysis), and press Allow. The OAuth library checks the request and
// keeps it server-side; the page only carries a one-time handle for it.
import { AuthorizationError, CimdFetchError, type AuthRequest, type ConsentDescription, type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { useCode } from './ai'
import type { Env } from './http'
import type { ConnectorProps } from './mcp'

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

interface PageOptions {
  handle: string
  details?: ConsentDescription
  error?: string
  appUrl?: string
}

function page({ handle, details, error, appUrl }: PageOptions): string {
  const name = details ? escape(details.clientName) : 'An AI'
  const origin = details?.clientDomain ? ` Published by <strong>${escape(details.clientDomain)}</strong>.` : ''
  const where = details ? `<p class="small">Access goes to <strong>${escape(details.redirectHost)}</strong>.${origin}</p>` : ''
  const loopback = details?.redirectIsLoopback ? '<p class="warn">This sends access to an app on this computer. Only continue if you just started connecting from it.</p>' : ''
  const app = appUrl ? `<a href="${escape(appUrl)}#/ai" target="_blank" rel="noopener">open the planner</a>` : 'open the planner'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect to your planner</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f5fb; --card: #fff; --text: #2b2738; --muted: #6b6580; --accent: #7a5cc4; --warn: #a3471f; }
  @media (prefers-color-scheme: dark) { :root { --bg: #17151d; --card: #221f2b; --text: #ece9f3; --muted: #a29cb4; --accent: #b39cf0; --warn: #f0a07a; } }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 26rem; margin: 2rem auto; padding: 1.5rem 1rem; background: var(--card); border-radius: 1rem; }
  h1 { font-size: 1.3rem; margin: 0 0 .75rem; }
  .small { color: var(--muted); font-size: .9rem; }
  .warn, .error { color: var(--warn); }
  label { display: block; margin: 1rem 0 .25rem; font-weight: 600; }
  input { box-sizing: border-box; width: 100%; padding: .6rem .75rem; font: inherit; font-size: 1.25rem; letter-spacing: .15em; text-transform: uppercase; border: 1px solid var(--muted); border-radius: .5rem; background: transparent; color: inherit; }
  .buttons { display: flex; gap: .75rem; margin-top: 1.25rem; }
  button { flex: 1; padding: .7rem; font: inherit; font-weight: 600; border-radius: .5rem; border: 1px solid var(--accent); background: transparent; color: var(--accent); cursor: pointer; }
  button[value=approve] { background: var(--accent); color: var(--card); }
  ul { padding-left: 1.2rem; }
</style>
</head>
<body>
<main>
  <h1>Connect ${name} to your planner?</h1>
  <p>It will be able to:</p>
  <ul>
    <li>read your weekly trends, notes and food diary</li>
    <li>read and save analyses, which show under Insights</li>
  </ul>
  ${where}
  ${loopback}
  <form method="post">
    <input type="hidden" name="handle" value="${escape(handle)}">
    <label for="code">Sign-in code</label>
    <input id="code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="12" autofocus>
    <p class="small">To get one, ${app} and go to Settings → AI analysis → Get a sign-in code.</p>
    ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
    <div class="buttons">
      <button name="decision" value="deny">Don’t allow</button>
      <button name="decision" value="approve">Allow</button>
    </div>
  </form>
</main>
</body>
</html>`
}

function html(body: string, headers = new Headers(), status = 200): Response {
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(body, { status, headers })
}

const plain = (message: string, status = 400) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

/** GET and POST /authorize. */
export async function authorize(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER as OAuthHelpers
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request)
      const details = await oauth.describeConsent(authRequest)
      const consent = await oauth.beginConsent(authRequest)
      return html(page({ handle: consent.handle, details, appUrl: env.APP_URL }), consent.headers)
    }
    if (request.method !== 'POST') return plain('Not found.', 404)

    const form = await request.formData()
    const handle = String(form.get('handle') ?? '')
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(request, handle)
      denied.headers.set('Location', denied.redirectTo)
      return new Response(null, { status: 302, headers: denied.headers })
    }
    // The code is checked before the handle is used, so a typo can be fixed on the same page.
    const space = await useCode(env, String(form.get('code') ?? ''))
    if (!space) {
      return html(page({ handle, error: 'That code didn’t work. Codes work once, for 10 minutes; get a new one in the planner.', appUrl: env.APP_URL }), undefined, 400)
    }
    const approved = await oauth.approveConsent(request, handle)
    const client = await clientName(oauth, approved.request)
    const props: ConnectorProps = { space, by: client }
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: space,
      metadata: { client },
      scope: approved.request.scope,
      props,
    })
    approved.headers.set('Location', redirectTo)
    return new Response(null, { status: 302, headers: approved.headers })
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302)
    if (error instanceof AuthorizationError) return plain(`${error.description} Start connecting again from the AI.`)
    if (error instanceof CimdFetchError) return plain('This app could not be checked. Try connecting again.')
    throw error
  }
}

async function clientName(oauth: OAuthHelpers, request: AuthRequest): Promise<string | undefined> {
  try {
    const client = await oauth.lookupClient(request.clientId)
    return client?.clientName?.slice(0, 60) || undefined
  } catch {
    return undefined
  }
}
