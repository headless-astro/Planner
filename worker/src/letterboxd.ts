// Reads a Letterboxd diary from its public RSS feed, only when the app asks (the button on
// Movies & shows). Browsers can't read letterboxd.com from the app's site, so the server does.
import { HttpError, isObject } from './http'

export interface DiaryEntry {
  title: string
  year: number | null
  /** The day it was watched, YYYY-MM-DD. */
  watched: string | null
  /** 0.5–5, or null when not rated. */
  rating: number | null
  rewatch: boolean
  /** Hearted on Letterboxd. */
  liked: boolean
}

const USERNAME = /^[A-Za-z0-9_]{1,40}$/

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(text: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(text.trim())
  const raw = cdata ? cdata[1] : text
  return raw
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name])
    .trim()
}

function tag(item: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item)
  return match ? decode(match[1]) : null
}

/** The films in a diary feed. Other items (lists, reviews without a film) are left out. */
export function parseDiary(xml: string): DiaryEntry[] {
  const entries: DiaryEntry[] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = tag(item, 'letterboxd:filmTitle')
    if (!title) continue
    const year = Number(tag(item, 'letterboxd:filmYear'))
    const watched = tag(item, 'letterboxd:watchedDate')
    const rating = Number(tag(item, 'letterboxd:memberRating'))
    entries.push({
      title,
      year: Number.isInteger(year) && year > 0 ? year : null,
      watched: watched && /^\d{4}-\d{2}-\d{2}$/.test(watched) ? watched : null,
      rating: rating > 0 && rating <= 5 ? rating : null,
      rewatch: tag(item, 'letterboxd:rewatch') === 'Yes',
      liked: tag(item, 'letterboxd:memberLike') === 'Yes',
    })
  }
  return entries
}

export async function readDiary(body: unknown): Promise<{ entries: DiaryEntry[] }> {
  const username = isObject(body) && typeof body.username === 'string' ? body.username.trim() : ''
  if (!USERNAME.test(username)) throw new HttpError(400, 'That isn’t a Letterboxd username.')
  let response: Response
  try {
    response = await fetch(`https://letterboxd.com/${username}/rss/`, {
      headers: { Accept: 'application/rss+xml, application/xml', 'User-Agent': 'planner-sync (personal planner)' },
    })
  } catch {
    throw new HttpError(502, 'Couldn’t reach Letterboxd.')
  }
  if (response.status === 404) throw new HttpError(404, 'Letterboxd has no profile with that username.')
  if (!response.ok) throw new HttpError(502, `Letterboxd answered with an error (${response.status}).`)
  return { entries: parseDiary(await response.text()) }
}
