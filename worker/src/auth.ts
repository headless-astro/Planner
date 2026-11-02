// The login (D47): the first device to connect claims the server with a key it made, and
// from then on every request must carry that key. Only the key's SHA-256 is stored.
import { getMeta, HttpError, type Env } from './http'

const BEARER = /^Bearer ([A-Za-z0-9_-]{32,128})$/

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function keyOf(request: Request): string {
  const match = BEARER.exec(request.headers.get('Authorization') ?? '')
  if (!match) throw new HttpError(401, 'The key is missing.')
  return match[1]
}

/** Compares in constant time, so the answer's timing gives nothing away. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

export const isClaimed = async (env: Env) => (await getMeta(env, 'key_hash')) !== null

/** Claims the server for this key. Claiming again with the same key is fine. */
export async function claim(request: Request, env: Env): Promise<void> {
  const hash = await sha256Hex(keyOf(request))
  // INSERT OR IGNORE: if two devices race, only the first one's key is kept.
  await env.DB.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('key_hash', ?1)").bind(hash).run()
  const stored = await getMeta(env, 'key_hash')
  if (!stored || !same(stored, hash)) throw new HttpError(409, 'This server is already connected to another key.')
}

export async function requireKey(request: Request, env: Env): Promise<void> {
  const key = keyOf(request)
  const stored = await getMeta(env, 'key_hash')
  if (!stored) throw new HttpError(409, 'This server isn’t connected to a device yet.')
  if (!same(await sha256Hex(key), stored)) throw new HttpError(401, 'Wrong key.')
}
