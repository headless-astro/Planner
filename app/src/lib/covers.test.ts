import { describe, expect, it } from 'vitest'
import { coverLink, findCovers } from './covers'

/** A stand-in for the network: answers by site, and records what was asked. */
function sites(answers: Record<string, unknown[]>) {
  const asked: string[] = []
  const fetcher = async (url: string) => {
    asked.push(url)
    const host = new URL(url).hostname
    const queue = answers[host] ?? []
    const body = queue.length > 1 ? queue.shift() : queue[0]
    return new Response(JSON.stringify(body ?? {}), { status: 200 })
  }
  return { asked, fetcher }
}

const wikipediaPages = (...pages: { title: string; index: number; thumb?: string }[]) => ({
  query: {
    pages: Object.fromEntries(
      pages.map((page, n) => [String(100 + n), { title: page.title, index: page.index, ...(page.thumb ? { thumbnail: { source: page.thumb } } : {}) }]),
    ),
  },
})

describe('finding covers (F78)', () => {
  it('finds a book on Open Library by title and author, leaving out ones without a cover', async () => {
    const { asked, fetcher } = sites({
      'openlibrary.org': [
        {
          docs: [
            { title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965 },
            { title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 11481354 },
          ],
        },
      ],
    })
    const choices = await findCovers({ title: 'Dune', author: 'Frank Herbert', source: 'book' }, fetcher)
    expect(choices).toEqual([{ url: 'https://covers.openlibrary.org/b/id/11481354-M.jpg', label: 'Dune · Frank Herbert · 1965' }])
    expect(new URL(asked[0]).searchParams.get('author')).toBe('Frank Herbert')
  })

  it('tries the title alone when the author finds nothing', async () => {
    const { asked, fetcher } = sites({ 'openlibrary.org': [{ docs: [] }, { docs: [{ title: 'Piranesi', cover_i: 7 }] }] })
    const [choice] = await findCovers({ title: 'Piranesi', author: 'Suzanna Clark', source: 'book' }, fetcher)
    expect(choice.url).toBe('https://covers.openlibrary.org/b/id/7-M.jpg')
    expect(new URL(asked[1]).searchParams.has('author')).toBe(false)
  })

  it('finds a show on TVmaze, on https', async () => {
    const { fetcher } = sites({
      'api.tvmaze.com': [[{ show: { name: 'Severance', premiered: '2022-02-18', image: { medium: 'http://static.tvmaze.com/s.jpg' } } }, { show: { name: 'No picture', image: null } }]],
    })
    expect(await findCovers({ title: 'Severance', source: 'show' }, fetcher)).toEqual([{ url: 'https://static.tvmaze.com/s.jpg', label: 'Severance · 2022' }])
  })

  it('finds films and games on Wikipedia, in its order, without the tracking on the address', async () => {
    const { asked, fetcher } = sites({
      'en.wikipedia.org': [
        wikipediaPages(
          { title: 'Past Lives (soundtrack)', index: 3, thumb: 'https://upload.wikimedia.org/c.jpg' },
          { title: 'Past Lives (film)', index: 1, thumb: 'https://upload.wikimedia.org/a.png?utm_source=en.wikipedia.org&utm_campaign=api' },
          { title: 'Past Lives', index: 2 },
        ),
      ],
    })
    const choices = await findCovers({ title: 'Past Lives', year: 2023, source: 'movie' }, fetcher)
    expect(choices.map((choice) => choice.label)).toEqual(['Past Lives (film)', 'Past Lives (soundtrack)'])
    expect(choices[0].url).toBe('https://upload.wikimedia.org/a.png')
    expect(new URL(asked[0]).searchParams.get('gsrsearch')).toBe('Past Lives 2023 film')

    const games = sites({ 'en.wikipedia.org': [wikipediaPages({ title: 'Hades (video game)', index: 1, thumb: 'https://upload.wikimedia.org/h.jpg' })] })
    await findCovers({ title: 'Hades', source: 'game' }, games.fetcher)
    expect(new URL(games.asked[0]).searchParams.get('gsrsearch')).toBe('Hades video game')
  })

  it('your own sections search with what one of them is called, then the title alone', async () => {
    const { asked, fetcher } = sites({ 'en.wikipedia.org': [{}, wikipediaPages({ title: 'Serial (podcast)', index: 1, thumb: 'https://upload.wikimedia.org/s.jpg' })] })
    const [choice] = await findCovers({ title: 'Serial', author: 'Sarah Koenig', source: 'other', one: 'podcast' }, fetcher)
    expect(choice.label).toBe('Serial (podcast)')
    expect(asked.map((url) => new URL(url).searchParams.get('gsrsearch'))).toEqual(['Serial Sarah Koenig podcast', 'Serial'])
  })

  it('an empty title asks nothing', async () => {
    const { asked, fetcher } = sites({})
    expect(await findCovers({ title: '  ', source: 'book' }, fetcher)).toEqual([])
    expect(asked).toEqual([])
  })

  it('a pasted link must be a picture on https', () => {
    expect(coverLink(' https://example.com/a.jpg ')).toBe('https://example.com/a.jpg')
    expect(coverLink('http://example.com/a.jpg')).toBeNull()
    expect(coverLink('javascript:alert(1)')).toBeNull()
    expect(coverLink('not a link')).toBeNull()
  })
})
