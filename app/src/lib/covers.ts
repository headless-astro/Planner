// Covers for books, films, shows, games and your own sections (F78). The app looks a title up
// itself, on free public sites that need no key: Open Library for books, TVmaze for shows and
// Wikipedia for the rest. Only the picture's address is kept (and synced); the picture loads
// from that site, so none of it goes through your server.
import { db, type MediaItem } from './db'
import { setCover, type CoverSource } from './media'

export interface CoverChoice {
  url: string
  /** What was found, e.g. "Dune · Frank Herbert · 1965". */
  label: string
}

/** What a lookup needs to know about the item and its section. */
export interface CoverQuery {
  title: string
  /** Books' author, or your own section's second field. */
  author?: string
  year?: number | null
  source: CoverSource
  /** "podcast": helps Wikipedia find the right page for your own sections. */
  one?: string
}

type Fetch = (url: string) => Promise<Response>

const params = (values: Record<string, string>) => new URLSearchParams(values).toString()

async function getJson(fetcher: Fetch, url: string): Promise<unknown> {
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`The lookup failed (${response.status}).`)
  return response.json()
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const text = (value: unknown) => (typeof value === 'string' ? value : '')
/** Only pictures on https, so a page never mixes in an insecure picture. */
const secure = (url: string) => url.replace(/^http:\/\//, 'https://')

// ── Books: Open Library ──

async function openLibrary(fetcher: Fetch, query: CoverQuery): Promise<CoverChoice[]> {
  const search = async (values: Record<string, string>) => {
    const answer = await getJson(fetcher, `https://openlibrary.org/search.json?${params({ ...values, limit: '12', fields: 'title,author_name,cover_i,first_publish_year' })}`)
    const docs = isObject(answer) && Array.isArray(answer.docs) ? answer.docs : []
    return docs.filter(isObject).flatMap((doc): CoverChoice[] => {
      if (typeof doc.cover_i !== 'number' || doc.cover_i <= 0) return []
      const author = Array.isArray(doc.author_name) ? text(doc.author_name[0]) : ''
      const year = typeof doc.first_publish_year === 'number' ? String(doc.first_publish_year) : ''
      return [{ url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`, label: [text(doc.title), author, year].filter(Boolean).join(' · ') }]
    })
  }
  const author = query.author?.trim()
  const found = await search(author ? { title: query.title, author } : { title: query.title })
  // A misspelt or partly remembered author shouldn't mean no cover: try the title alone.
  return found.length || !author ? found : search({ title: query.title })
}

// ── Shows: TVmaze ──

async function tvmaze(fetcher: Fetch, query: CoverQuery): Promise<CoverChoice[]> {
  const answer = await getJson(fetcher, `https://api.tvmaze.com/search/shows?${params({ q: query.title })}`)
  return (Array.isArray(answer) ? answer : []).flatMap((hit): CoverChoice[] => {
    const show = isObject(hit) && isObject(hit.show) ? hit.show : null
    const image = show && isObject(show.image) ? text(show.image.medium) || text(show.image.original) : ''
    if (!show || !image) return []
    const year = text(show.premiered).slice(0, 4)
    return [{ url: secure(image), label: [text(show.name), year].filter(Boolean).join(' · ') }]
  })
}

// ── Films, games and your own sections: Wikipedia ──

/** The word that finds the right page: "Hades video game", "Dune 2021 film". */
function wikipediaTerms(query: CoverQuery): string {
  if (query.source === 'movie') return [query.title, query.year, 'film'].filter(Boolean).join(' ')
  if (query.source === 'show') return `${query.title} TV series`
  if (query.source === 'game') return `${query.title} video game`
  if (query.source === 'book') return [query.title, query.author, 'novel'].filter(Boolean).join(' ')
  return [query.title, query.author, query.one].filter(Boolean).join(' ')
}

async function wikipedia(fetcher: Fetch, terms: string): Promise<CoverChoice[]> {
  const answer = await getJson(
    fetcher,
    `https://en.wikipedia.org/w/api.php?${params({
      action: 'query',
      format: 'json',
      // Lets the browser read the answer from the app's site.
      origin: '*',
      generator: 'search',
      gsrsearch: terms,
      gsrlimit: '8',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '300',
      // Posters and box art aren't free pictures; Wikipedia still shows them on the page.
      pilicense: 'any',
    })}`,
  )
  const pages = isObject(answer) && isObject(answer.query) && isObject(answer.query.pages) ? Object.values(answer.query.pages) : []
  return pages
    .filter(isObject)
    .sort((a, b) => Number(a.index) - Number(b.index))
    .flatMap((page): CoverChoice[] => {
      const source = isObject(page.thumbnail) ? text(page.thumbnail.source) : ''
      // The address comes with tracking added on; the picture is the same without it.
      return source ? [{ url: secure(source.replace(/\?utm_[^#]*$/, '')), label: text(page.title) }] : []
    })
}

/** Covers that fit a title, the likeliest first. Empty when nothing has a picture. */
export async function findCovers(query: CoverQuery, fetcher: Fetch = (url) => fetch(url)): Promise<CoverChoice[]> {
  if (!query.title.trim()) return []
  const first =
    query.source === 'book' ? await openLibrary(fetcher, query) : query.source === 'show' ? await tvmaze(fetcher, query) : await wikipedia(fetcher, wikipediaTerms(query))
  if (first.length) return first
  // Nothing on the usual site: Wikipedia by its title alone, then with a hint at what it is.
  const fallback = await wikipedia(fetcher, query.source === 'other' ? query.title : wikipediaTerms(query))
  return fallback.length || query.source === 'other' ? fallback : wikipedia(fetcher, query.title)
}

/** An address you paste in for a cover: a picture on https. */
export function coverLink(input: string): string | null {
  const value = input.trim()
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

// ── Looking covers up as they come into view ──

const queue: { item: MediaItem; query: CoverQuery }[] = []
/** Asked for in this session: each is looked up once, even when nothing was found. */
const asked = new Set<string>()
let running = false

/** Time between two lookups, so a long list never floods a site. */
const GAP_MS = 300

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Looks up a cover for an item that never had one looked up, one at a time. The first match
 * is kept (or null when there's none), and you can choose another under Edit. When the device
 * is offline or a site doesn't answer, it's left for the next time the app opens.
 */
export function queueCover(item: MediaItem, query: CoverQuery): void {
  if (item.cover !== undefined || asked.has(item.id)) return
  asked.add(item.id)
  queue.push({ item, query })
  if (!running) void drain()
}

/** Lets an item be looked up again in this session, after its title changed. */
export function lookAgain(id: string): void {
  asked.delete(id)
}

async function drain(): Promise<void> {
  running = true
  try {
    while (queue.length) {
      const next = queue.shift()
      if (!next) break
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        asked.delete(next.item.id)
        continue
      }
      // Chosen by hand (or on another device) while it waited: that one stays.
      const current = await db.media.get(next.item.id)
      if (!current || current.deleted || current.cover !== undefined) continue
      try {
        const [choice] = await findCovers(next.query)
        await setCover(next.item.id, choice?.url ?? null)
      } catch (error) {
        // Not found is null; a failed lookup stays unasked, for the next time.
        asked.delete(next.item.id)
        console.warn('Cover lookup failed', error)
      }
      await wait(GAP_MS)
    }
  } finally {
    running = false
  }
}
