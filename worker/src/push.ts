// Reminders go out as Web Push messages without a payload (PLAN.md 11.5): the device wakes up
// and writes the notification from its own data. Push services want a signed token (VAPID,
// RFC 8292); the keys are made the first time they're needed and kept in the database.
import { getMeta, HttpError, isObject, setMeta, type Env } from './http'

const encoder = new TextEncoder()

export function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export interface VapidKeys {
  /** The uncompressed P-256 public key, base64url: what the app subscribes with. */
  publicKey: string
  privateJwk: JsonWebKey
}

export async function vapidKeys(env: Env): Promise<VapidKeys> {
  const stored = await getMeta(env, 'vapid')
  if (stored) return JSON.parse(stored) as VapidKeys
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const keys: VapidKeys = { publicKey: base64url(publicRaw), privateJwk: (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey }
  // If two requests race, the first one's keys are kept and both use them.
  await env.DB.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('vapid', ?1)").bind(JSON.stringify(keys)).run()
  return JSON.parse((await getMeta(env, 'vapid')) ?? JSON.stringify(keys)) as VapidKeys
}

let signing: { publicKey: string; key: CryptoKey } | null = null

async function signingKey(keys: VapidKeys): Promise<CryptoKey> {
  if (signing?.publicKey !== keys.publicKey) {
    signing = {
      publicKey: keys.publicKey,
      key: await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
    }
  }
  return signing.key
}

/** The signed token a push service checks: who's sending, to which service, until when. */
export async function vapidToken(keys: VapidKeys, endpoint: string, subject: string, now: Date): Promise<string> {
  const part = (value: object) => base64url(encoder.encode(JSON.stringify(value)))
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60, sub: subject }
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part(claims)}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(keys), encoder.encode(unsigned))
  return `${unsigned}.${base64url(new Uint8Array(signature))}`
}

export type PushResult = 'sent' | 'gone' | 'failed'

export async function sendPush(env: Env, endpoint: string, now = new Date()): Promise<PushResult> {
  const keys = await vapidKeys(env)
  // Push services may contact the sender; the app's own address is the contact.
  const subject = (await getMeta(env, 'app_url')) ?? 'mailto:planner@example.com'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${await vapidToken(keys, endpoint, subject, now)}, k=${keys.publicKey}`,
      TTL: '3600',
      Urgency: 'normal',
    },
    body: '',
  })
  if (response.ok) return 'sent'
  // The device unsubscribed, or the browser data was cleared.
  if (response.status === 404 || response.status === 410) return 'gone'
  console.warn(`Push failed with ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return 'failed'
}

// ── Subscriptions: each device that turns reminders on ──

const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 1000) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 100) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export async function subscribe(request: Request, env: Env, body: unknown): Promise<void> {
  const subscription = isObject(body) && isObject(body.subscription) ? body.subscription : null
  const keys = subscription && isObject(subscription.keys) ? subscription.keys : null
  if (!subscription || !keys || !isHttpsUrl(subscription.endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    throw new HttpError(400, 'Expected { subscription, timezone }.')
  }
  const timezone = isObject(body) && isTimeZone(body.timezone) ? body.timezone : null
  if (!timezone) throw new HttpError(400, 'Unknown time zone.')
  await env.DB.prepare(
    `INSERT INTO subscriptions (endpoint, p256dh, auth, timezone, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, timezone = excluded.timezone`,
  )
    .bind(subscription.endpoint, keys.p256dh.slice(0, 200), keys.auth.slice(0, 200), timezone, Date.now())
    .run()
  const origin = request.headers.get('Origin')
  if (origin && isHttpsUrl(origin)) await setMeta(env, 'app_url', origin)
}

const endpointOf = (body: unknown): string => {
  if (!isObject(body) || !isHttpsUrl(body.endpoint)) throw new HttpError(400, 'Expected { endpoint }.')
  return body.endpoint
}

export async function unsubscribe(env: Env, body: unknown): Promise<void> {
  await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?1').bind(endpointOf(body)).run()
}

/** Sends one push to a device now, so you can see reminders work. */
export async function sendTest(env: Env, body: unknown): Promise<PushResult> {
  const endpoint = endpointOf(body)
  const known = await env.DB.prepare('SELECT 1 AS known FROM subscriptions WHERE endpoint = ?1').bind(endpoint).first<number>('known')
  if (!known) throw new HttpError(404, 'This device hasn’t turned reminders on.')
  const result = await sendPush(env, endpoint)
  if (result === 'gone') await unsubscribe(env, { endpoint })
  return result
}
