// The login (D47, D72): each person's devices share a key they made, and every request carries
// it. Each key has its own space; only the keys' SHA-256 hashes are stored. The first key to
// connect is the owner; anyone else needs a one-time invite the owner made.
import { getMeta, HttpError, isObject, type Env } from './http'

const BEARER = /^Bearer ([A-Za-z0-9_-]{32,128})$/
/** Invites last a week. */
export const INVITE_DAYS = 7

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

export const isClaimed = async (env: Env) => (await env.DB.prepare('SELECT 1 AS any FROM spaces LIMIT 1').first<number>('any')) !== null

const hasSpace = async (env: Env, hash: string) => (await env.DB.prepare('SELECT 1 AS known FROM spaces WHERE key_hash = ?1').bind(hash).first<number>('known')) !== null

/**
 * Connects a key. The first key on an empty server becomes the owner; a key that already has a
 * space is fine; a new key needs a valid invite, which is then used up.
 */
export async function claim(request: Request, env: Env, body: unknown): Promise<void> {
  const hash = await sha256Hex(keyOf(request))
  if (await hasSpace(env, hash)) return
  if (!(await isClaimed(env))) {
    // INSERT OR IGNORE: if two devices race on an empty server, only the first one's key is kept.
    await env.DB.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('key_hash', ?1)").bind(hash).run()
    const owner = await getMeta(env, 'key_hash')
    if (owner && same(owner, hash)) {
      await env.DB.prepare('INSERT OR IGNORE INTO spaces (key_hash, created_at) VALUES (?1, ?2)').bind(hash, Date.now()).run()
      return
    }
  }
  const invite = isObject(body) && typeof body.invite === 'string' ? body.invite.trim() : ''
  if (!invite) throw new HttpError(409, 'This server is already connected to another key.')
  const codeHash = await sha256Hex(invite.toUpperCase())
  // Used up as it's checked, so one invite lets in one person.
  const used = await env.DB.prepare('DELETE FROM invites WHERE code_hash = ?1 AND expires > ?2').bind(codeHash, Date.now()).run()
  if (!used.meta.changes) throw new HttpError(403, 'That invite code isn’t valid, or it was already used or has run out. Ask for a new one.')
  await env.DB.prepare('INSERT OR IGNORE INTO spaces (key_hash, created_at) VALUES (?1, ?2)').bind(hash, Date.now()).run()
}

/** Checks the key and returns its space (the key's hash). */
export async function requireKey(request: Request, env: Env): Promise<string> {
  const hash = await sha256Hex(keyOf(request))
  if (await hasSpace(env, hash)) return hash
  if (!(await isClaimed(env))) throw new HttpError(409, 'This server isn’t connected to a device yet.')
  throw new HttpError(401, 'Wrong key.')
}

/** Whether a space belongs to the owner, the key that first claimed the server. */
export async function isOwner(env: Env, space: string): Promise<boolean> {
  const owner = await getMeta(env, 'key_hash')
  return !!owner && same(owner, space)
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A new one-time invite (owner only): 12 letters and digits, easy to read out. */
export async function createInvite(env: Env, space: string, now = Date.now()): Promise<{ code: string; expires: number }> {
  if (!(await isOwner(env, space))) throw new HttpError(403, 'Only the server’s owner can invite someone.')
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const code = [...bytes].map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length]).join('')
  const expires = now + INVITE_DAYS * 24 * 60 * 60 * 1000
  await env.DB.prepare('DELETE FROM invites WHERE expires <= ?1').bind(now).run()
  await env.DB.prepare('INSERT INTO invites (code_hash, expires) VALUES (?1, ?2)').bind(await sha256Hex(code), expires).run()
  return { code, expires }
}
