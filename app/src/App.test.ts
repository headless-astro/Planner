import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'
import { db } from './lib/db'
import { listDrawingLogs } from './lib/drawing'
import { addMedia, listMedia } from './lib/media'
import { getWeek, listDoses, listHabits, listSnackDefs, setEntry, setMeasurement } from './lib/repo'
import { getSyncState, linkFor } from './lib/sync'
import { setRoutineDone } from './lib/routines'
import { listTopics } from './lib/study'

// Screen tests: the whole app in a simulated browser, saving to an in-memory database.
// The clock is fixed to Monday 2 Nov 2026, midday.

let app: ReturnType<typeof mount> | undefined

async function open(hash = '') {
  location.hash = hash
  app = mount(App, { target: document.body })
  flushSync()
  await vi.waitFor(() => expect(document.querySelector('h1')).not.toBeNull())
}

function close() {
  if (app) unmount(app)
  app = undefined
  document.body.innerHTML = ''
}

function go(hash: string) {
  location.hash = hash
  window.dispatchEvent(new Event('hashchange'))
}

const text = () => document.body.textContent ?? ''
const heading = () => document.querySelector('h1')?.textContent
const buttonByText = (label: string) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith(label))
const checkboxFor = (label: string) =>
  [...document.querySelectorAll('label.check')].find((row) => row.textContent?.includes(label))?.querySelector('input') ?? undefined

function click(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error('element not found')
  element.click()
  flushSync()
}

function type(element: Element | null | undefined, value: string) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('field not found')
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

function submit(element: Element | null | undefined) {
  if (!(element instanceof HTMLInputElement) || !element.form) throw new Error('form not found')
  element.form.requestSubmit()
  flushSync()
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0))
  await db.delete()
  await db.open()
})

afterEach(() => {
  close()
  location.hash = ''
  vi.useRealTimers()
})

describe('Today', () => {
  it('lays out Monday from the saved setup', async () => {
    await open()
    expect(heading()).toBe('Monday')
    await vi.waitFor(() => expect(text()).toContain('Meds · empty stomach'))
    expect(text()).toContain('Tech study → #1')
    expect(text()).toContain('Workout → strength, 2 rounds')
  })

  it('keeps ticks after the app is reopened', async () => {
    await open()
    await vi.waitFor(() => expect(checkboxFor('Workout')).toBeTruthy())
    click(checkboxFor('Workout'))
    await vi.waitFor(() => expect(document.querySelector('.week')?.textContent).toContain('Fitness 1/6'))
    close()
    await open()
    await vi.waitFor(() => expect(checkboxFor('Workout')?.checked).toBe(true))
  })

  it('adds snacks against the 200 kcal budget', async () => {
    await open()
    await vi.waitFor(() => expect(buttonByText('Add snack')).toBeTruthy())
    click(buttonByText('Add snack'))
    await vi.waitFor(() => expect(buttonByText('10 almonds')).toBeTruthy())
    click(buttonByText('10 almonds'))
    await vi.waitFor(() => expect(document.querySelector('.snack-head')?.textContent).toContain('70 / 200 kcal'))
    click(buttonByText('7 walnut halves'))
    await vi.waitFor(() => expect(document.querySelector('.snack-head')?.textContent).toContain('160 / 200 kcal'))
  })

  it('adds a to-do', async () => {
    await open()
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="New to-do"]')).toBeTruthy())
    const input = document.querySelector('input[aria-label="New to-do"]')
    type(input, 'finish shaders')
    submit(input)
    await vi.waitFor(() => expect(text()).toContain('finish shaders'))
  })

  it('saves the food diary as you type', async () => {
    await open()
    await vi.waitFor(() => expect(document.querySelector('textarea[placeholder="Roughly what you ate today"]')).toBeTruthy())
    type(document.querySelector('textarea[placeholder="Roughly what you ate today"]'), 'lentil soup, yogurt')
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|diary'))?.value).toBe('lentil soup, yogurt'))
  })

  it('shows the food rules when you want to see them', async () => {
    await open()
    await vi.waitFor(() => expect(text()).toContain('See the rules'))
    expect(text()).toContain('The kitchen closes at 00:00')
  })

  it('takes a note on what you did once an item is ticked', async () => {
    await open()
    await vi.waitFor(() => expect(checkboxFor('Workout')).toBeTruthy())
    expect(document.querySelector('textarea[aria-label^="Note: Workout"]')).toBeNull()
    click(checkboxFor('Workout'))
    await vi.waitFor(() => expect(document.querySelector('textarea[aria-label^="Note: Workout"]')).toBeTruthy())
    type(document.querySelector('textarea[aria-label^="Note: Workout"]'), '3 rounds, knees fine')
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|note:workout'))?.value).toBe('3 rounds, knees fine'))
  })
})

describe('Week', () => {
  it('shows the seven days with today marked', async () => {
    await open('#/week')
    expect(heading()).toBe('This week')
    expect(document.querySelectorAll('.daycard')).toHaveLength(7)
    expect(document.querySelector('.daycard.today')?.textContent).toContain('Monday')
  })

  it('can be changed, and Today follows', async () => {
    await open('#/week')
    click(buttonByText('Change the week'))
    const monday = document.querySelector('.daycard select')
    if (!(monday instanceof HTMLSelectElement)) throw new Error('no select')
    monday.value = 'drawing'
    monday.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => expect((await getWeek())[0].morning).toBe('drawing'))
    click(buttonByText('Done'))
    go('#/today')
    await vi.waitFor(() => expect(heading()).toBe('Monday'))
    await vi.waitFor(() => expect(text()).toContain('Drawing → Anatomy'))
    expect(text()).not.toContain('Tech study → #1')
  })
})

describe('History', () => {
  it('lists past days and opens one for editing', async () => {
    await setEntry('2026-11-01', 'work', '2')
    await open('#/history')
    await vi.waitFor(() => expect(text()).toContain('Work 2'))
    go('#/day/2026-11-01')
    await vi.waitFor(() => expect(heading()).toBe('Sunday'))
    expect(text()).toContain('Back to today')
  })
})

describe('Setup', () => {
  it('adds a dose that then shows on Today', async () => {
    await open('#/setup')
    const input = document.querySelector('input[aria-label="New dose"]')
    type(input, 'Meds · with lunch')
    submit(input)
    await vi.waitFor(async () => expect((await listDoses()).map((dose) => dose.label)).toContain('Meds · with lunch'))
    go('#/today')
    await vi.waitFor(() => expect(text()).toContain('Meds · with lunch'))
  })

  it('switches the colours', async () => {
    await open('#/setup')
    click(buttonByText('Mint'))
    await vi.waitFor(() => expect(document.documentElement.dataset.palette).toBe('mint'))
    expect(document.querySelector('.swatch[aria-pressed="true"]')?.textContent).toContain('Mint')
  })

  it('adds a habit with a target and a snack with its calories', async () => {
    await open('#/setup')
    type(document.querySelector('input[aria-label="New habit"]'), 'Stretch')
    type(document.querySelector('input[aria-label="New habit: days a week"]'), '3')
    submit(document.querySelector('input[aria-label="New habit"]'))
    type(document.querySelector('input[aria-label="New snack"]'), 'Rice cake')
    type(document.querySelector('input[aria-label="New snack: kcal"]'), '35')
    submit(document.querySelector('input[aria-label="New snack"]'))
    await vi.waitFor(async () => expect(await listHabits()).toContainEqual(expect.objectContaining({ label: 'Stretch', weeklyTarget: 3 })))
    await vi.waitFor(async () => expect(await listSnackDefs()).toContainEqual(expect.objectContaining({ name: 'Rice cake', kcal: 35 })))
  })
})

describe('Routines', () => {
  it('marks a routine done, which also ticks Chores for cleaning', async () => {
    await open('#/routines')
    await vi.waitFor(() => expect(text()).toContain('Vacuum'))
    const row = [...document.querySelectorAll('.routine-head')].find((head) => head.textContent?.includes('Vacuum'))
    click(row?.querySelector('button'))
    await vi.waitFor(() => expect(row?.textContent).toContain('Undo'))
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|tick:chores'))?.value).toBe(true))
  })

  it('shows a routine on Today when it is due', async () => {
    await setRoutineDone('routine-vacuum', '2026-10-28', true)
    await open()
    await vi.waitFor(() => expect(text()).toContain('routine · due today'))
  })
})

describe('Lists', () => {
  it('adds a task with a deadline, which then shows on Today', async () => {
    await open('#/lists')
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="New task"]')).toBeTruthy())
    const input = document.querySelector('input[aria-label="New task"]')
    type(input, 'Renew passport')
    type(document.querySelector('input[aria-label="Deadline (optional)"]'), '2026-11-02')
    submit(input)
    await vi.waitFor(() => expect(text()).toContain('Renew passport'))
    go('#/today')
    await vi.waitFor(() => expect(text()).toContain('Life · due today'))
  })
})

describe('Shopping', () => {
  it('puts a staple on the list when it runs low', async () => {
    await open('#/shopping')
    await vi.waitFor(() => expect(checkboxFor('Oats')).toBeTruthy())
    click(checkboxFor('Oats'))
    await vi.waitFor(() => expect(document.querySelector('section')?.textContent).toContain('Oats'))
  })
})

describe('Tech study', () => {
  it('ticking the morning slot marks the topic done', async () => {
    await open()
    await vi.waitFor(() => expect(checkboxFor('Tech study → #1')).toBeTruthy())
    click(checkboxFor('Tech study → #1'))
    await vi.waitFor(async () => expect((await listTopics())[0].doneDate).toBe('2026-11-02'))
    go('#/study')
    await vi.waitFor(() => expect(text()).toContain('1 of 37'))
  })
})

describe('Spanish', () => {
  it('ticking the Tuesday book slot logs the first review session', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0))
    await open()
    await vi.waitFor(() => expect(checkboxFor('Spanish book → review session 1 of 2')).toBeTruthy())
    click(checkboxFor('Spanish book'))
    await vi.waitFor(() => expect(checkboxFor('Spanish book')?.checked).toBe(true))
    go('#/spanish')
    await vi.waitFor(() => expect(text()).toContain('1 review session'))
  })

  it('keeps what you did in a book session, written on Today', async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0))
    await open()
    await vi.waitFor(() => expect(checkboxFor('Spanish book')).toBeTruthy())
    click(checkboxFor('Spanish book'))
    await vi.waitFor(() => expect(document.querySelector('textarea[aria-label^="Note: Spanish book"]')).toBeTruthy())
    type(document.querySelector('textarea[aria-label^="Note: Spanish book"]'), 'Review of units 1–2, plus 2 extra worksheets')
    await vi.waitFor(async () => expect((await db.spanishLogs.get('2026-11-03|book'))?.notes).toBe('Review of units 1–2, plus 2 extra worksheets'))
    go('#/spanish')
    await vi.waitFor(() => expect(text()).toContain('plus 2 extra worksheets'))
  })

  it('logs a book session with what you did from the Spanish screen', async () => {
    await open('#/spanish')
    click(buttonByText('Book'))
    click([...document.querySelectorAll('label.inline-check')].find((label) => label.textContent?.includes('Review session'))?.querySelector('input'))
    type(document.querySelector('input[placeholder="3"]'), '3')
    type(document.querySelector('form.edit-panel textarea'), 'Unit 3 reading, exercises 1–4')
    submit(document.querySelector('form.edit-panel input[type="date"]'))
    await vi.waitFor(() => expect(text()).toContain('Book: unit 3'))
    expect(text()).toContain('Unit 3 reading, exercises 1–4')
  })
})

describe('Recipes', () => {
  it('"Cooked today" ticks Cooked', async () => {
    await open('#/recipes')
    await vi.waitFor(() => expect(buttonByText('Cooked today')).toBeTruthy())
    click(buttonByText('Cooked today'))
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|tick:cooked'))?.value).toBe(true))
  })
})

describe('Stats and review', () => {
  it('show the numbers and the weight chart', async () => {
    await setMeasurement('2026-10-24', 'weight', 81.2)
    await setMeasurement('2026-10-31', 'weight', 80.6)
    await open('#/stats')
    await vi.waitFor(() => expect(text()).toContain('Days logged'))
    await vi.waitFor(() => expect(document.querySelector('.chart-plot')?.getAttribute('aria-valuetext')).toBe('Sat 31 Oct: 80.6 kg'))
    expect(text()).toContain('Goal pace')
    go('#/review')
    await vi.waitFor(() => expect(text()).toContain('The week in numbers'))
  })
})

describe('Drawing', () => {
  it("Friday's slot shows the week's area and logs a session", async () => {
    vi.setSystemTime(new Date(2026, 10, 6, 12, 0))
    await open()
    await vi.waitFor(() => expect(checkboxFor('Drawing → Anatomy')).toBeTruthy())
    expect(text()).toContain('Show exercises')
    click(checkboxFor('Drawing → Anatomy'))
    await vi.waitFor(async () => expect(await listDrawingLogs()).toMatchObject([{ date: '2026-11-06', areaId: 'drawing-anatomy' }]))
    go('#/drawing')
    await vi.waitFor(() => expect(heading()).toBe('Drawing'))
    await vi.waitFor(() => expect(text()).toContain('1 session'))
    expect(text()).toContain('This week: Anatomy')
  })
})

describe('Books, games and shows', () => {
  it('adds a book, and finishing it ticks Read and asks for a thumb', async () => {
    await open('#/books')
    const input = document.querySelector('input[aria-label="New book"]')
    type(input, 'Dune')
    submit(input)
    await vi.waitFor(() => expect(document.querySelector('.list .button')?.textContent).toBe('Finished'))
    click(document.querySelector('.list .button'))
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|tick:read'))?.value).toBe(true))
    await vi.waitFor(() => expect(text()).toContain('How was it?'))
    click(document.querySelector('.rate button[aria-label="Enjoyed it"]'))
    await vi.waitFor(async () => expect((await listMedia('book'))[0]).toMatchObject({ thumb: 'up', rating: null }))
  })

  it('movies and shows are separate tabs', async () => {
    await open('#/books')
    go('#/shows')
    await vi.waitFor(() => expect(heading()).toBe('Shows'))
    expect(document.querySelector('a[aria-current="page"].chip')?.textContent).toBe('Shows')
    type(document.querySelector('input[aria-label="New show"]'), 'Severance')
    submit(document.querySelector('input[aria-label="New show"]'))
    await vi.waitFor(() => expect(text()).toContain('Severance'))
    expect((await listMedia('watch'))[0]).toMatchObject({ format: 'show' })
    go('#/movies')
    await vi.waitFor(() => expect(heading()).toBe('Movies'))
    expect(text()).not.toContain('Severance')
  })

  it('hearts one, and the heart sub-tab shows only favourites', async () => {
    await addMedia('game', 'Hades', 'done', '2026-11-01')
    await addMedia('game', 'Celeste', 'done', '2026-11-02')
    await open('#/games')
    await vi.waitFor(() => expect(document.querySelector('button[aria-label=\'Add "Hades" to favourites\']')).toBeTruthy())
    click(document.querySelector('button[aria-label=\'Add "Hades" to favourites\']'))
    await vi.waitFor(async () => expect((await listMedia('game')).find((game) => game.title === 'Hades')?.favorite).toBe(true))
    go('#/games/favorites')
    await vi.waitFor(() => expect(text()).toContain('Hades'))
    expect(text()).not.toContain('Celeste')
  })

  it('the More tab opens on Books', async () => {
    await open('#/today')
    expect(document.querySelector('.tabs a[href="#/books"]')?.textContent?.trim()).toBe('More')
    go('#/more')
    await vi.waitFor(() => expect(heading()).toBe('Books'))
  })

  it('adds a movie watched in the past with its dates and rating in one go', async () => {
    await open('#/movies')
    type(document.querySelector('input[aria-label="New movie"]'), 'Paterson')
    click([...document.querySelectorAll('.add-media .seg button')].find((button) => button.textContent === 'Finished'))
    await vi.waitFor(() => expect(document.querySelectorAll('.add-media input[type="date"]')).toHaveLength(2))
    for (const field of document.querySelectorAll('.add-media input[type="date"]')) type(field, '2026-09-12')
    click(document.querySelector('.add-media button[aria-label="5 of 5"]'))
    submit(document.querySelector('input[aria-label="New movie"]'))
    await vi.waitFor(async () =>
      expect((await listMedia('watch'))[0]).toMatchObject({ title: 'Paterson', started: '2026-09-12', finished: '2026-09-12', rating: 5 }),
    )
    expect((await db.entries.get('2026-09-12|tick:movie'))?.value).toBe(true)
  })

  it('keeps the want-to list on its own sub-tab', async () => {
    await open('#/games/want')
    await vi.waitFor(() => expect(document.querySelector('.subtabs a[aria-current="page"]')?.textContent).toBe('Want to play'))
    type(document.querySelector('input[aria-label="New game"]'), 'Hollow Knight')
    submit(document.querySelector('input[aria-label="New game"]'))
    await vi.waitFor(() => expect(text()).toContain('Hollow Knight'))
    go('#/games')
    await vi.waitFor(() => expect(document.querySelector('.subtabs a[aria-current="page"]')?.textContent).toBe('Playing'))
    expect(text()).not.toContain('Hollow Knight')
  })
})

describe('Projects in Lists', () => {
  it('the craft projects are tasks in the Projects list, with notes and a link', async () => {
    await open('#/lists')
    await vi.waitFor(() => expect(buttonByText('Projects')).toBeTruthy())
    click(buttonByText('Projects'))
    await vi.waitFor(() => expect(text()).toContain('Heart Bag'))
    expect(text()).toContain('Kind: Crochet')
    const notes = document.querySelector('textarea')
    if (!(notes instanceof HTMLTextAreaElement)) throw new Error('notes not found')
    notes.value = 'Kind: Crochet\nGreen yarn, safety eyes'
    notes.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => expect((await db.tasks.get('task-project-frog'))?.notes).toBe('Kind: Crochet\nGreen yarn, safety eyes'))
    await vi.waitFor(() => expect(text()).toContain('Green yarn, safety eyes'))
  })

  it('the old Projects link opens Lists', async () => {
    await open('#/projects')
    await vi.waitFor(() => expect(heading()).toBe('Lists'))
  })
})

describe('Tabs', () => {
  it('has seven tabs, each an icon with a label, and keeps the right one lit', async () => {
    await open('#/today')
    const labels = [...document.querySelectorAll('.tabs a')].map((tab) => tab.textContent?.trim())
    expect(labels).toEqual(['Today', 'Plans', 'Routines', 'History', 'More', 'Me', 'Settings'])
    expect(document.querySelectorAll('.tabs a svg')).toHaveLength(7)
    const lit = () => document.querySelector('.tabs a[aria-current="page"]')?.textContent?.trim()
    go('#/spanish')
    await vi.waitFor(() => expect(lit()).toBe('Plans'))
    go('#/review')
    await vi.waitFor(() => expect(lit()).toBe('History'))
    go('#/shopping')
    await vi.waitFor(() => expect(lit()).toBe('Me'))
    go('#/stats')
    await vi.waitFor(() => expect(lit()).toBe('Settings'))
  })
})

describe('Plans', () => {
  it('sums up each plan, with links to the full pages', async () => {
    await open('#/plans')
    await vi.waitFor(() => expect(text()).toContain('Next: #1'))
    expect(text()).toContain('Book: review session 1 of 2 · Tomorrow')
    expect(text()).toContain('This week: Anatomy · Friday')
    expect([...document.querySelectorAll('.plan-title')].map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['#/week', '#/study', '#/spanish', '#/drawing', '#/tracks']),
    )
    click(document.querySelector('.subtabs a[href="#/lists"]'))
    go('#/lists')
    await vi.waitFor(() => expect(heading()).toBe('Lists'))
  })
})

describe('Me', () => {
  it('shows health, the exercise plan, goals and food', async () => {
    await setMeasurement('2026-10-24', 'weight', 81.2)
    await setMeasurement('2026-10-31', 'weight', 80.6)
    await setEntry('2026-11-02', 'tick:workout', true)
    await open('#/me')
    await vi.waitFor(() => expect(text()).toContain('80.6 kg'))
    expect(text()).toContain('−0.6 since Sat 24 Oct')
    await vi.waitFor(() => expect(text()).toContain('1 of 6'))
    expect(text()).toContain('Primer 2 · week 1 of 4')
    await vi.waitFor(() => expect(text()).toContain('0 of 37 tech topics done'))
    expect(text()).toContain('Recipes')
    expect(document.querySelector('input')).toBeNull()
    go('#/exercise')
    await vi.waitFor(() => expect(heading()).toBe('Exercise plan'))
    expect(text()).toContain('Push-up on handles, knees down')
  })
})

describe('Settings', () => {
  it('leads to setup, goals, stats and sync', async () => {
    await open('#/settings')
    const links = [...document.querySelectorAll('.more-list a')].map((link) => link.getAttribute('href'))
    expect(links).toEqual(expect.arrayContaining(['#/setup', '#/goals', '#/stats', '#/sync']))
    go('#/goals')
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="New goal"]')).toBeTruthy())
  })
})

describe('Weekly reviews in History', () => {
  it('lists the weeks, each opening its review', async () => {
    await setEntry('2026-10-26', 'review', 'A good week')
    await open('#/history')
    await vi.waitFor(() => expect(text()).toContain('notes written'))
    const link = document.querySelector('a[href="#/review/2026-10-26"]')
    expect(link?.textContent).toContain('Week of Mon 26 Oct')
    go('#/review/2026-10-26')
    await vi.waitFor(() => expect(text()).toContain('The week in numbers'))
  })

  it('Today offers the review on Sundays', async () => {
    vi.setSystemTime(new Date(2026, 10, 8, 12, 0))
    await open()
    await vi.waitFor(() => expect(heading()).toBe('Sunday'))
    await vi.waitFor(() => expect(document.querySelector('.review-cta a')?.getAttribute('href')).toBe('#/review'))
  })
})

describe('Sync and reminders', () => {
  const SERVER = 'https://planner-sync.test'

  beforeEach(() => {
    // A server that takes everything and has nothing new to send back.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname
        const body = path === '/' ? { app: 'planner-sync', claimed: false } : path === '/claim' ? { claimed: true } : { cursor: 0, changes: [], more: false, accepted: 0, reset: false }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects the first device and shows the link for the others', async () => {
    await open('#/sync')
    const input = document.querySelector('input[aria-label="Server address"]')
    type(input, 'planner-sync.test')
    submit(input)
    await vi.waitFor(() => expect(text()).toContain('Connected to planner-sync.test'))
    await vi.waitFor(() => expect(text()).toContain('Synced just now'))
    click(buttonByText('Show the link and QR code'))
    expect(document.querySelector('svg.qr path')?.getAttribute('d')).toMatch(/^M/)
  })

  it('connects another device from its link, and takes the key out of the address bar', async () => {
    const link = linkFor({ server: SERVER, key: 'k'.repeat(43) }, 'https://me.github.io/planner/')
    await open(`#/link/${link.split('#/link/')[1]}`)
    expect(text()).toContain('planner-sync.test')
    expect(location.hash).toBe('#/link')
    click(buttonByText('Connect'))
    await vi.waitFor(() => expect(text()).toContain('Connected. Your data is syncing now.'))
    expect((await getSyncState()).config).toEqual({ server: SERVER, key: 'k'.repeat(43) })
  })
})

describe('Crunch days', () => {
  it('can be started from Today', async () => {
    await open()
    await vi.waitFor(() => expect(buttonByText('Busy stretch?')).toBeTruthy())
    click(buttonByText('Busy stretch?'))
    await vi.waitFor(() => expect(text()).toContain('Crunch day:'))
  })
})
