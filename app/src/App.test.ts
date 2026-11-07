import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'
import { db } from './lib/db'
import { addMedia, listMedia } from './lib/media'
import { ensureSeeded, getExercise, getWeek, listDoses, listHabits, setEntry, setMeasurement } from './lib/repo'
import { listRecipes, updateRecipe } from './lib/recipes'
import { getSyncState, linkFor } from './lib/sync'
import { setRoutineDone } from './lib/routines'
import { DRAWING_TRACK, SPANISH_TRACK, TECH_TRACK } from './lib/activities'
import { listSessions, listSteps } from './lib/tracks'

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

/** Today shows one part of the day at a time (F44). */
async function showPart(label: 'Morning' | 'Any time' | 'Evening') {
  await vi.waitFor(() => expect(document.querySelector('[role="tab"]')).toBeTruthy())
  click([...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.trim().startsWith(label)))
}

function submit(element: Element | null | undefined) {
  if (!(element instanceof HTMLInputElement) || !element.form) throw new Error('form not found')
  element.form.requestSubmit()
  flushSync()
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0))
  localStorage.clear()
  await db.delete()
  await db.open()
  // These screens are tested with the original setup; the first start has its own tests.
  await db.meta.put({ id: 'start', value: 'mine' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  close()
  location.hash = ''
  vi.useRealTimers()
})

describe('Today', () => {
  it('lays out Monday from the saved setup', async () => {
    await open()
    expect(heading()).toBe('Monday')
    await vi.waitFor(() => expect(text()).toContain('Meds · empty stomach'))
    await vi.waitFor(() => expect(text()).toContain('Tech study → Revision'))
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

  it('shows one part of the day at a time, opening on the one for the time of day', async () => {
    await open()
    await vi.waitFor(() => expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Morning'))
    expect(checkboxFor('Workout')).toBeTruthy()
    await showPart('Evening')
    expect(checkboxFor('Workout')).toBeUndefined()
    close()
    vi.setSystemTime(new Date(2026, 10, 2, 22, 0))
    await open()
    await vi.waitFor(() => expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Evening'))
  })

  it('stays on a part after ticking its last item', async () => {
    await open()
    await showPart('Evening')
    const evening = () => [...document.querySelectorAll('[role="tabpanel"] label.check input')]
    await vi.waitFor(() => expect(evening().length).toBeGreaterThan(0))
    for (const box of evening()) click(box)
    await vi.waitFor(() => {
      const [done, total] = (document.querySelector('.part-tab.evening .part-count')?.textContent ?? '').split('/')
      expect(done).toBe(total)
    })
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Evening')
  })

  it('adds a to-do', async () => {
    await open()
    await showPart('Any time')
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

  it('asks how eating went, against the food guidelines, with Partly counting as half a day', async () => {
    await open()
    await vi.waitFor(() => expect(text()).toContain('See the guidelines'))
    expect(text()).toContain('The kitchen closes at 00:00')
    expect(document.querySelector('.snacks')).toBeNull()
    click(buttonByText('Partly'))
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|rules'))?.value).toBe('partly'))
    await vi.waitFor(() => expect(document.querySelector('.week')?.textContent).toContain('Food guidelines ½/6'))
    click(buttonByText('Mostly'))
    await vi.waitFor(() => expect(document.querySelector('.week')?.textContent).toContain('Food guidelines 1/6'))
  })

  it('rates energy, and marks a period day once tracking is on', async () => {
    await open()
    await vi.waitFor(() => expect(document.querySelector('[aria-labelledby="energy-label"]')).toBeTruthy())
    click(document.querySelector('[aria-labelledby="energy-label"] button:nth-child(2)'))
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|energy'))?.value).toBe('2'))
    expect(document.querySelector('button[aria-label="Period day"]')).toBeNull()
    go('#/settings')
    await vi.waitFor(() => expect(text()).toContain('Track periods'))
    click([...document.querySelectorAll('label.inline-check')].find((label) => label.textContent?.includes('Track periods'))?.querySelector('input'))
    go('#/today')
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Period day"]')).toBeTruthy())
    click(document.querySelector('button[aria-label="Period day"]'))
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|period'))?.value).toBe(true))
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
    await vi.waitFor(() => expect(buttonByText('Change the week')).toBeTruthy())
    click(buttonByText('Change the week'))
    // Monday: take tech study off and put drawing on (F70).
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Remove Tech study from Monday"]')).toBeTruthy())
    click(document.querySelector('button[aria-label="Remove Tech study from Monday"]'))
    await vi.waitFor(async () => expect((await getWeek())[0].activities?.map((activity) => activity.trackId)).toEqual([SPANISH_TRACK]))
    const add = document.querySelector('select[aria-label="Add an activity on Monday"]')
    if (!(add instanceof HTMLSelectElement)) throw new Error('no select')
    add.value = DRAWING_TRACK
    add.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => expect((await getWeek())[0].activities?.map((activity) => activity.trackId)).toContain(DRAWING_TRACK))
    click(buttonByText('Done'))
    go('#/today')
    await vi.waitFor(() => expect(heading()).toBe('Monday'))
    await showPart('Any time')
    await vi.waitFor(() => expect(text()).toContain('Drawing study'))
    expect(text()).not.toContain('Tech study → Revision')
  })
})

describe('First start', () => {
  beforeEach(async () => {
    await db.meta.delete('start')
  })

  it('asks how to start, and examples give a small general setup', async () => {
    await open()
    await vi.waitFor(() => expect(heading()).toBe('Welcome'))
    expect(document.querySelector('nav.tabs')?.hasAttribute('hidden')).toBe(true)
    click(buttonByText('Start with examples'))
    await vi.waitFor(() => expect(heading()).not.toBe('Welcome'))
    expect((await listHabits()).map((habit) => habit.label)).toEqual(['Read', 'Walk', 'Tidy up'])
    expect(await listDoses()).toEqual([])
    // The plans made for one person are off: no tech study or Spanish on Today.
    expect(text()).not.toContain('Tech study')
    expect(text()).not.toContain('Spanish')
    go('#/routines')
    await vi.waitFor(() => expect(text()).toContain('Home'))
  })

  it('starts empty', async () => {
    await open()
    await vi.waitFor(() => expect(buttonByText('Start empty')).toBeTruthy())
    click(buttonByText('Start empty'))
    await vi.waitFor(() => expect(heading()).not.toBe('Welcome'))
    expect(await listHabits()).toEqual([])
    expect(await db.routines.count()).toBe(0)
    close()
    // It doesn't ask again.
    await open()
    await vi.waitFor(() => expect(heading()).not.toBe('Welcome'))
  })

  it('carries on as before on a device that was set up before', async () => {
    await db.meta.put({ id: 'seeded', value: 1 })
    await open()
    await vi.waitFor(() => expect(heading()).toBe('Monday'))
  })
})

describe('Upcoming', () => {
  it('lists everything in the next 7 days as one list, the date once per day', async () => {
    await open('#/upcoming')
    await vi.waitFor(() => expect(document.querySelector('.up-list')).toBeTruthy())
    const dates = [...document.querySelectorAll('.up-list .up-when')].map((when) => when.textContent?.trim()).filter(Boolean)
    expect(dates[0]).toBe('Today')
    // Driving runs for 4 weeks, so its Saturdays are listed; ongoing tracks aren't (D87).
    expect(dates).toContain('Sat 7 Nov')
    // Drawing study's Friday session isn't listed: it's an ongoing track.
    expect(dates).not.toContain('Fri 6 Nov')
    expect(document.querySelector('.up-list a.up-when')?.getAttribute('href')).toBe('#/today')
  })
})

describe('Insights', () => {
  it('shows wins, habits, health with the weight chart, and opens a day from the calendar', async () => {
    await setMeasurement('2026-10-24', 'weight', 81.2)
    await setMeasurement('2026-10-31', 'weight', 80.6)
    await setEntry('2026-11-01', 'work', '2')
    await open('#/insights')
    await vi.waitFor(() => expect(text()).toContain('Going well'))
    expect(text()).toContain('Habits')
    expect(text()).toContain("What's slipping")
    await vi.waitFor(() => expect(document.querySelector('.chart-plot')?.getAttribute('aria-valuetext')).toBe('Sat 31 Oct: 80.6 kg'))
    expect(text()).toContain('All weigh-ins (2)')
    expect(document.querySelector('a.month-day[href="#/day/2026-11-01"]')?.classList.contains('logged')).toBe(true)
    go('#/day/2026-11-01')
    await vi.waitFor(() => expect(heading()).toBe('Sunday'))
    expect(text()).toContain('Back to today')
  })

  it('switches the period and remembers it', async () => {
    await open('#/insights')
    await vi.waitFor(() => expect(buttonByText('Week')).toBeTruthy())
    click(buttonByText('Week'))
    await vi.waitFor(() => expect(document.querySelector('.habit-value')?.textContent).toMatch(/of \d+/))
    expect(localStorage.getItem('insights-period')).toBe('week')
    // On Week, this week's review sits at the top.
    expect(document.querySelector('.review-top .review-card')?.getAttribute('href')).toBe('#/review')
    close()
    await open('#/insights')
    await vi.waitFor(() => expect(document.querySelector('.period-seg [aria-pressed="true"]')?.textContent).toBe('Week'))
  })

  it('old History and Stats links open Insights', async () => {
    await open('#/history')
    await vi.waitFor(() => expect(heading()).toBe('Insights'))
    go('#/stats')
    await vi.waitFor(() => expect(heading()).toBe('Insights'))
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
    await showPart('Any time')
    await vi.waitFor(() => expect(text()).toContain('Meds · with lunch'))
  })

  it('switches the colours', async () => {
    await open('#/setup')
    click(buttonByText('Mint'))
    await vi.waitFor(() => expect(document.documentElement.dataset.palette).toBe('mint'))
    expect(document.querySelector('.swatch[aria-pressed="true"]')?.textContent).toContain('Mint')
  })

  it('adds a habit with a target', async () => {
    await open('#/setup')
    type(document.querySelector('input[aria-label="New habit"]'), 'Stretch')
    type(document.querySelector('input[aria-label="New habit: days a week"]'), '3')
    submit(document.querySelector('input[aria-label="New habit"]'))
    await vi.waitFor(async () => expect(await listHabits()).toContainEqual(expect.objectContaining({ label: 'Stretch', weeklyTarget: 3 })))
  })
})

describe('Routines', () => {
  it('marks a routine done, which also ticks Chores for cleaning', async () => {
    await open('#/routines')
    // Never-done routines aren't due yet, so Vacuum is under its area, not under Due.
    await vi.waitFor(() => expect(buttonByText('Cleaning')).toBeTruthy())
    expect(text()).toContain('Nothing due or late right now.')
    click(buttonByText('Cleaning'))
    await vi.waitFor(() => expect(text()).toContain('Vacuum'))
    const row = [...document.querySelectorAll('.routine-head')].find((head) => head.textContent?.includes('Vacuum'))
    click(row?.querySelector('button'))
    await vi.waitFor(() => expect(row?.textContent).toContain('Undo'))
    expect(row?.querySelector('.due-pill')?.textContent).toBe('done · next in 5 days')
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|tick:chores'))?.value).toBe(true))
  })

  it('lists late routines under Due, and adds one behind the + button', async () => {
    await setRoutineDone('routine-vacuum', '2026-10-20', true)
    await open('#/routines')
    await vi.waitFor(() => expect(text()).toContain('Vacuum'))
    expect(buttonByText('Due')?.textContent).toContain('Due 1')
    // When it's due stands out; editing waits behind the pencil.
    expect(document.querySelector('.due-pill.late')?.textContent).toBe('8 days late')
    expect(document.querySelector('.routine-edit')).toBeNull()
    click(document.querySelector('button[aria-label="Edit Vacuum"]'))
    expect(document.querySelector('.routine-edit')?.textContent).toContain('Every how many days')
    expect(document.querySelector('input[aria-label="New routine name"]')).toBeNull()
    click(document.querySelector('button[aria-label="Add a routine"]'))
    type(document.querySelector('input[aria-label="New routine name"]'), 'Water plants')
    const area = document.querySelector('select[aria-label="Area"]')
    if (!(area instanceof HTMLSelectElement)) throw new Error('no area')
    area.value = '__new-area__'
    area.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    type(document.querySelector('input[aria-label="New area name"]'), 'Garden')
    submit(document.querySelector('input[aria-label="New routine name"]'))
    await vi.waitFor(() => expect(document.querySelector('.list-tabs [aria-pressed="true"]')?.textContent).toBe('Garden'))
    expect(text()).toContain('Water plants')
  })

  it('shows a routine on Today when it is due', async () => {
    await setRoutineDone('routine-vacuum', '2026-10-28', true)
    await open()
    await showPart('Any time')
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
    await showPart('Any time')
    await vi.waitFor(() => expect(text()).toContain('Life · due today'))
  })
})

describe('Shopping', () => {
  it('puts a staple on To buy when it runs low, and ticks it off', async () => {
    await open('#/shopping')
    await vi.waitFor(() => expect(buttonByText('Food')).toBeTruthy())
    expect(text()).toContain('Nothing to buy right now.')
    click(buttonByText('Food'))
    await vi.waitFor(() => expect(checkboxFor('Oats')).toBeTruthy())
    click(checkboxFor('Oats'))
    await vi.waitFor(() => expect(buttonByText('To buy')?.textContent).toBe('To buy 1'))
    click(buttonByText('To buy'))
    await vi.waitFor(() => expect(text()).toContain('Oats'))
    click(buttonByText('Got it'))
    await vi.waitFor(() => expect(text()).toContain('Nothing to buy right now.'))
  })

  it('adds a one-off thing on a new tab, which goes away once bought', async () => {
    await open('#/shopping')
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Add a tab"]')).toBeTruthy())
    click(document.querySelector('button[aria-label="Add a tab"]'))
    type(document.querySelector('input[aria-label="New item"]'), 'Phone charger')
    type(document.querySelector('input[aria-label="New tab name"]'), 'Home')
    click([...document.querySelectorAll('label.inline-check')].find((label) => label.textContent?.includes('Just this once'))?.querySelector('input'))
    submit(document.querySelector('input[aria-label="New item"]'))
    await vi.waitFor(() => expect(buttonByText('Home')).toBeTruthy())
    await vi.waitFor(() => expect(text()).toContain('Phone charger'))
    expect(text()).toContain('Home · just this once')
    click(buttonByText('Got it'))
    await vi.waitFor(() => expect(text()).not.toContain('Phone charger'))
    expect((await db.staples.toArray()).find((staple) => staple.name === 'Phone charger')?.deleted).toBeTruthy()
  })
})

describe('Tech study, a track (D83)', () => {
  it('ticking its morning activity marks the next step done', async () => {
    await open()
    await vi.waitFor(() => expect(checkboxFor('Tech study → Revision')).toBeTruthy())
    click(checkboxFor('Tech study → Revision'))
    await vi.waitFor(async () => expect((await listSteps(TECH_TRACK))[0].doneDate).toBe('2026-11-02'))
    go('#/study')
    await vi.waitFor(() => expect(heading()).toBe('Tech study'))
    await vi.waitFor(() => expect(text()).toContain('1 of 37'))
  })
})

describe('Spanish, one track (D85)', () => {
  it("ticking Tuesday's book does the next step, the first review session", async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0))
    await open()
    await vi.waitFor(() => expect(checkboxFor('Spanish · Book → Review session 1')).toBeTruthy())
    click(checkboxFor('Spanish · Book → Review session 1'))
    await vi.waitFor(async () => expect((await listSteps(SPANISH_TRACK))[0].doneDate).toBe('2026-11-03'))
    go('#/spanish')
    await vi.waitFor(() => expect(heading()).toBe('Spanish'))
    await vi.waitFor(() => expect(text()).toContain('done Tue 3 Nov'))
  })

  it("logs the day's video minutes and what you watched, toward the hours", async () => {
    await open()
    await showPart('Any time')
    await vi.waitFor(() => expect(checkboxFor('Spanish · 1 video')).toBeTruthy())
    click(checkboxFor('Spanish · 1 video'))
    const row = () => [...document.querySelectorAll('li.row')].find((item) => item.textContent?.includes('Spanish · 1 video'))
    await vi.waitFor(() => expect(row()?.querySelector('input[type="number"]')).toBeTruthy())
    const minutes = row()?.querySelector('input[type="number"]')
    type(minutes, '30')
    minutes?.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => expect((await listSessions()).find((session) => session.trackId === SPANISH_TRACK)?.minutes).toBe(30))
    go('#/spanish')
    await vi.waitFor(() => expect(text()).toContain('0.5 h'))
  })

  it("logs a session from the track's page, as the next step", async () => {
    await open('#/spanish')
    await vi.waitFor(() => expect(text()).toContain('Log a session'))
    type(document.querySelector('form.edit-panel input[type="text"]'), 'Unit 3 reading, exercises 1–4')
    click([...document.querySelectorAll('form.edit-panel label.inline-check')].find((label) => label.textContent?.includes('next step'))?.querySelector('input'))
    submit(document.querySelector('form.edit-panel input[type="date"]'))
    await vi.waitFor(() => expect(text()).toContain('Unit 3 reading, exercises 1–4'))
    expect((await listSteps(SPANISH_TRACK))[0].doneDate).toBe('2026-11-02')
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

describe('Drawing, a looping track (D84)', () => {
  it("Friday's activity has the week's focus, and a session also ticks Drawing", async () => {
    vi.setSystemTime(new Date(2026, 10, 6, 12, 0))
    await open()
    await vi.waitFor(() => expect(checkboxFor('Drawing study')).toBeTruthy())
    expect(text()).toContain('Focus: Anatomy')
    expect(text()).toContain('About Anatomy')
    click(checkboxFor('Drawing study'))
    await vi.waitFor(async () => expect((await listSessions()).find((session) => session.trackId === DRAWING_TRACK)).toMatchObject({ date: '2026-11-06', focus: 'Anatomy' }))
    expect((await db.entries.get('2026-11-06|tick:drawing'))?.value).toBe(true)
    go('#/drawing')
    await vi.waitFor(() => expect(heading()).toBe('Drawing study'))
    expect(text()).toContain('this week: Anatomy')
  })
})

describe('Books, games and shows', () => {
  it('adds a book, and finishing it ticks Read and asks for a thumb', async () => {
    await open('#/books')
    expect(document.querySelector('input[aria-label="New book"]')).toBeNull()
    click(document.querySelector('button[aria-label="Add a book"]'))
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
    click(document.querySelector('button[aria-label="Add a show"]'))
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
    await open('#/games/done')
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
    await open('#/movies/done')
    click(document.querySelector('button[aria-label="Add a movie"]'))
    type(document.querySelector('input[aria-label="New movie"]'), 'Paterson')
    await vi.waitFor(() => expect(document.querySelectorAll('.add-media input[type="date"]')).toHaveLength(2))
    for (const field of document.querySelectorAll('.add-media input[type="date"]')) type(field, '2026-09-12')
    click(document.querySelector('.add-media button[aria-label="5 of 5"]'))
    submit(document.querySelector('input[aria-label="New movie"]'))
    await vi.waitFor(async () =>
      expect((await listMedia('watch'))[0]).toMatchObject({ title: 'Paterson', started: '2026-09-12', finished: '2026-09-12', rating: 5 }),
    )
    expect((await db.entries.get('2026-09-12|tick:movie'))?.value).toBe(true)
  })

  it('keeps finished ones on their own sub-tab, with Letterboxd folded away on Movies', async () => {
    await addMedia('book', 'Dune', 'done', '2026-10-01')
    await addMedia('book', 'Piranesi', 'active', '2026-11-01')
    await open('#/books')
    await vi.waitFor(() => expect(text()).toContain('Piranesi'))
    expect(text()).not.toContain('Dune')
    go('#/books/done')
    await vi.waitFor(() => expect(text()).toContain('Dune'))
    expect(text()).not.toContain('Piranesi')
    expect([...document.querySelectorAll('.media-subtabs a')].map((tab) => tab.textContent?.trim())).toEqual(['Reading', 'Want to read', 'Finished', ''])
    go('#/movies/done')
    await vi.waitFor(() => expect(document.querySelector('details.letterboxd')).toBeTruthy())
    expect(document.querySelector('details.letterboxd')?.hasAttribute('open')).toBe(false)
    go('#/movies')
    await vi.waitFor(() => expect(document.querySelector('.subtabs a[aria-current="page"]')?.textContent).toBe('Watching'))
    expect(document.querySelector('details.letterboxd')).toBeNull()
  })

  it('keeps the want-to list on its own sub-tab', async () => {
    await open('#/games/want')
    await vi.waitFor(() => expect(document.querySelector('.subtabs a[aria-current="page"]')?.textContent).toBe('Want to play'))
    click(document.querySelector('button[aria-label="Add to want to play"]'))
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
    expect(labels).toEqual(['Today', 'Plans', 'Routines', 'Insights', 'More', 'Me', 'Settings'])
    expect(document.querySelectorAll('.tabs a svg')).toHaveLength(7)
    const lit = () => document.querySelector('.tabs a[aria-current="page"]')?.textContent?.trim()
    go('#/spanish')
    await vi.waitFor(() => expect(lit()).toBe('Plans'))
    go('#/review')
    await vi.waitFor(() => expect(lit()).toBe('Insights'))
    go('#/shopping')
    await vi.waitFor(() => expect(lit()).toBe('Me'))
    go('#/setup')
    await vi.waitFor(() => expect(lit()).toBe('Settings'))
  })
})

describe('Plans', () => {
  it('sums up each track, with links to their pages', async () => {
    await open('#/plans')
    await vi.waitFor(() => expect(text()).toContain('Next: Revision'))
    expect(text()).toContain('Next: Review session 1')
    expect(text()).toContain('This week: Anatomy')
    expect([...document.querySelectorAll('.plan-title')].map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['#/week', `#/track/${TECH_TRACK}`, `#/track/${SPANISH_TRACK}`, `#/track/${DRAWING_TRACK}`, '#/track/track-driving']),
    )
    click(document.querySelector('.subtabs a[href="#/lists"]'))
    go('#/lists')
    await vi.waitFor(() => expect(heading()).toBe('Lists'))
  })

  it('adds a track, with steps', async () => {
    await open('#/tracks/new')
    await vi.waitFor(() => expect(text()).toContain('New track'))
    type(document.querySelector('form.edit-panel input[type="text"]'), 'Guitar')
    click([...document.querySelectorAll('form.edit-panel label.inline-check')].find((label) => label.textContent?.includes('Steps in order'))?.querySelector('input'))
    submit(document.querySelector('form.edit-panel input[type="text"]'))
    await vi.waitFor(() => expect(heading()).toBe('Guitar'))
    type(document.querySelector('input[aria-label="New step"]'), 'Open chords')
    submit(document.querySelector('input[aria-label="New step"]'))
    await vi.waitFor(() => expect(text()).toContain('Open chords'))
    expect(text()).toContain('not on your week yet')
  })
})

describe('Me', () => {
  it('shows health, the exercise plan, goals and food', async () => {
    await setMeasurement('2026-10-24', 'weight', 81.2)
    await setMeasurement('2026-10-31', 'weight', 80.6)
    await setEntry('2026-11-02', 'tick:workout', true)
    await open('#/me')
    await vi.waitFor(() => expect(text()).toContain('80.6 kg'))
    expect(text()).toContain('↓ 0.6 kg since Sat 24 Oct')
    expect(document.querySelector('a.tile-link')?.getAttribute('href')).toBe('#/insights')
    await vi.waitFor(() => expect(text()).toContain('1 of 6'))
    expect(document.querySelector('.shortcuts')?.textContent).toContain('Primer · week 1 of 4')
    expect(document.querySelector('.shortcuts')?.textContent).toContain('Recipes')
    await vi.waitFor(() => expect(document.querySelector('.goal-value')).toBeTruthy())
    expect(text()).toContain('steps done')
    expect(document.querySelector('input')).toBeNull()
    go('#/exercise')
    await vi.waitFor(() => expect(heading()).toBe('Exercise plan'))
    expect(text()).toContain('Push-up on handles, knees down')
  })
})

describe('What you use', () => {
  it('turning the exercise plan off hides it everywhere, and on brings it back', async () => {
    await open('#/settings')
    await vi.waitFor(() => expect(text()).toContain('What you use'))
    const exercise = () => [...document.querySelectorAll('label.feature')].find((label) => label.textContent?.includes('Exercise plan'))?.querySelector('input')
    click(exercise())
    await vi.waitFor(async () => expect((await db.settings.get('features'))?.value).toMatchObject({ exercise: false }))
    go('#/today')
    await vi.waitFor(() => expect(document.querySelector('.week')).toBeTruthy())
    expect(text()).not.toContain('Workout →')
    expect(document.querySelector('.week')?.textContent).not.toContain('Fitness')
    go('#/settings')
    await vi.waitFor(() => expect(exercise()).toBeTruthy())
    click(exercise())
    go('#/today')
    await vi.waitFor(() => expect(text()).toContain('Workout →'))
  })

  it('takes your own activities on the Week screen, and counts them (D86)', async () => {
    await open('#/week')
    await vi.waitFor(() => expect(buttonByText('Change the week')).toBeTruthy())
    click(buttonByText('Change the week'))
    for (const day of ['Monday', 'Wednesday']) {
      const add = document.querySelector(`select[aria-label="Add an activity on ${day}"]`)
      if (!(add instanceof HTMLSelectElement)) throw new Error('no select')
      add.value = '__own__'
      add.dispatchEvent(new Event('change', { bubbles: true }))
      await vi.waitFor(() => expect(document.querySelector(`input[aria-label="Activity on ${day}"]`)).toBeTruthy())
      const own = document.querySelector(`input[aria-label="Activity on ${day}"]`)
      type(own, 'Guitar, 20 min')
      own?.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await vi.waitFor(async () => expect((await getWeek())[2].activities?.some((activity) => activity.text === 'Guitar, 20 min')).toBe(true))
    go('#/today')
    await showPart('Any time')
    await vi.waitFor(() => expect(checkboxFor('Guitar, 20 min')).toBeTruthy())
    expect(document.querySelector('.week')?.textContent).toContain('Guitar, 20 min 0/2')
    click(checkboxFor('Guitar, 20 min'))
    await vi.waitFor(() => expect(document.querySelector('.week')?.textContent).toContain('Guitar, 20 min 1/2'))
  })
})

describe('Exercise blocks', () => {
  it('switches the active block, and Today follows it', async () => {
    vi.stubGlobal('confirm', () => true)
    await open('#/exercise')
    await vi.waitFor(() => expect(buttonByText('Easy')).toBeTruthy())
    click(buttonByText('Easy'))
    await vi.waitFor(() => expect(text()).toContain('Goblet squat'))
    click(buttonByText('Make Easy active'))
    await vi.waitFor(async () => expect((await getExercise()).active).toBe('easy'))
    go('#/today')
    await vi.waitFor(() => expect(text()).toContain('Easy · week 1 of 4'))
  })

  it('edits a block', async () => {
    await open('#/exercise')
    await vi.waitFor(() => expect(buttonByText('Edit')).toBeTruthy())
    click(buttonByText('Edit'))
    const name = document.querySelector('input[aria-label="Move 1"]')
    type(name, 'Box squat')
    name?.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => expect((await getExercise()).blocks.primer.moves[0].name).toBe('Box squat'))
  })
})

describe('Recipes in More', () => {
  it('opens on Cooked, with a Recipes chip in More, and a recipe to try moves to Cooked once cooked', async () => {
    await open('#/recipes')
    await vi.waitFor(() => expect(document.querySelector('.subtabs a[aria-current="page"]')?.textContent).toBe('Cooked'))
    expect(document.querySelector('a.chip[aria-current="page"]')?.textContent).toBe('Recipes')
    expect(document.querySelector('.tabs a[aria-current="page"]')?.textContent?.trim()).toBe('More')
    go('#/recipes/want')
    await vi.waitFor(() => expect(text()).toContain('Nothing to try yet'))
    click(document.querySelector('button[aria-label="Add a recipe to try"]'))
    type(document.querySelector('input[aria-label="New recipe"]'), 'Menemen')
    submit(document.querySelector('input[aria-label="New recipe"]'))
    await vi.waitFor(() => expect(text()).toContain('Menemen'))
    click(buttonByText('Cooked today'))
    await vi.waitFor(() => expect(text()).not.toContain('Menemen'))
    go('#/recipes')
    await vi.waitFor(() => expect(text()).toContain('Menemen'))
  })

  it('puts the ingredients you pick on the shopping list', async () => {
    await ensureSeeded()
    const [first] = await listRecipes()
    await updateRecipe(first.id, { ingredients: '- Oats\n- Saffron' })
    await open('#/recipes')
    await vi.waitFor(() => expect(buttonByText('Add ingredients to shopping')).toBeTruthy())
    click(buttonByText('Add ingredients to shopping'))
    for (const name of ['Oats', 'Saffron']) click(checkboxFor(name) ?? [...document.querySelectorAll('.shopping-pick label')].find((label) => label.textContent?.includes(name))?.querySelector('input'))
    click(buttonByText('Put 2 on the shopping list'))
    await vi.waitFor(() => expect(text()).toContain('2 things on your shopping list.'))
    const staples = await db.staples.toArray()
    expect(staples.find((staple) => staple.name === 'Oats')?.low).toBe(true)
    expect(staples.find((staple) => staple.name === 'Saffron')).toMatchObject({ oneOff: true, low: true })
  })
})

describe('Settings', () => {
  it('leads to everything you can change', async () => {
    await open('#/settings')
    const links = [...document.querySelectorAll('.more-list a')].map((link) => link.getAttribute('href'))
    expect(links).toEqual(expect.arrayContaining(['#/setup', '#/goals', '#/week', '#/tracks', '#/routines', '#/shopping', '#/sync']))
    expect(links).not.toContain('#/stats')
    go('#/goals')
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="New goal"]')).toBeTruthy())
  })
})

describe('Weekly review', () => {
  it("picks up last week's one thing, keeps three notes, and can be marked done", async () => {
    await setEntry('2026-10-26', 'review:next', 'Cook on Sunday')
    await open('#/review')
    await vi.waitFor(() => expect(text()).toContain('Last week you said'))
    expect(text()).toContain('Cook on Sunday')
    const well = [...document.querySelectorAll('label.field')].find((label) => label.textContent?.includes('What went well'))?.querySelector('textarea')
    type(well, 'Slept better')
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|review:well'))?.value).toBe('Slept better'))
    click(buttonByText('Done reviewing'))
    await vi.waitFor(async () => expect((await db.entries.get('2026-11-02|reviewed'))?.value).toBe(true))
    await vi.waitFor(() => expect(text()).toContain('Reviewed ✓'))
    go('#/insights')
    await vi.waitFor(() => expect(document.querySelector('.review-card')?.textContent).toContain('Done ✓'))
  })

  it('clears late tasks: done, moved or dropped', async () => {
    await open('#/lists')
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="New task"]')).toBeTruthy())
    type(document.querySelector('input[aria-label="New task"]'), 'Return the parcel')
    type(document.querySelector('input[aria-label="Deadline (optional)"]'), '2026-10-30')
    submit(document.querySelector('input[aria-label="New task"]'))
    await vi.waitFor(() => expect(text()).toContain('Return the parcel'))
    go('#/review')
    await vi.waitFor(() => expect(text()).toContain('Late tasks'))
    const row = [...document.querySelectorAll('.late-task')].find((item) => item.textContent?.includes('Return the parcel'))
    click(row?.querySelector('button'))
    await vi.waitFor(() => expect(text()).not.toContain('Late tasks'))
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
