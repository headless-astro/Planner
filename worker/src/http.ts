// Small HTTP helpers: JSON responses, errors with a status, CORS.

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  DB: D1Database
  /** Sign-ins for the AI connector (F74). Without it the server works as before, minus the connector. */
  OAUTH_KV?: KVNamespace
  /** Put there by the OAuth library for the routes outside /mcp. */
  OAUTH_PROVIDER?: OAuthHelpers
  /** The app's address, for the link on the sign-in page. */
  APP_URL?: string
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The app sends its key in a header, never a cookie, so any site may call: the key is the lock. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/** About 1.5 MB, because one D1 query parameter holds at most 2 MB. */
const MAX_BODY = 1_500_000

export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) throw new HttpError(413, 'Too much in one request.')
  const text = await request.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'Too much in one request.')
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'The request isn’t valid JSON.')
  }
}

/** Like readJson, but an empty body is fine (older apps claim without one). */
export async function readJsonOrNothing(request: Request): Promise<unknown> {
  const text = await request.clone().text()
  return text.trim() ? readJson(request) : null
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A value from the meta table. */
export const getMeta = (env: Env, key: string) => env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first<string>('value')

export async function setMeta(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, value).run()
}
