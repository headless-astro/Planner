import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addAnalysis, analysisExport, deleteAnalysis, listAnalyses, sendAnalysis, setAiConnect } from './ai'
import { buildAnalysis, type AnalysisData } from './analysis'
import { ALL_PARTS, analysisMarkdown, dayName } from './analysisText'
import { db, type Entry } from './db'
import { ALL_FEATURES } from './features'
import { setMeta } from './repo'
import { DEFAULT_TARGETS, WEEK_TEMPLATE } from './setup'

// Wednesday 11 Nov 2026; the week started on Monday 9 Nov.
const today = '2026-11-11'
const entry = (date: string, key: string, value: unknown): Entry => ({ id: `${date}|${key}`, date, key, value, updatedAt: 1 })

const base: AnalysisData = {
  entries: [],
  habits: [{ id: 'h-read', label: 'Read', weeklyTarget: 3, order: 0, updatedAt: 1 }],
  targets: DEFAULT_TARGETS,
  crunches: [],
  week: WEEK_TEMPLATE,
  tracks: [],
  trackSessions: [],
  topics: [],
  routineLogs: [],
  tasks: [],
  measurements: [],
  doses: [{ id: 'd-am', label: 'Morning', time: 'morning', order: 0, updatedAt: 1 }],
  features: ALL_FEATURES,
  periodsOn: false,
}

const data: AnalysisData = {
  ...base,
  entries: [
    entry('2026-11-02', 'tick:h-read', true),
    entry('2026-11-03', 'tick:h-read', true),
    entry('2026-11-03', 'rules', 'partly'),
    entry('2026-11-03', 'diary', 'Lentil soup\ncrisps at night'),
    entry('2026-11-03', 'energy', '2'),
    entry('2026-11-03', 'work', '3'),
    entry('2026-11-03', 'note', 'Long day'),
    entry('2026-11-03', 'note:workout', 'Knees felt fine'),
    entry('2026-11-03', 'note:d-am', 'never shown: meds take no notes'),
    entry('2026-11-03', 'tick:d-am', true),
    entry('2026-11-02', 'review:well', 'Walked every day'),
    entry('2026-11-02', 'review:hard', 'Evenings'),
    entry('2026-11-10', 'rules', 'kept'),
    entry('2026-11-10', 'diary', 'Chicken and rice'),
    entry('2026-11-10', 'deleted', 'gone'),
  ].map((row) => (row.key === 'deleted' ? { ...row, deleted: true } : row)),
  measurements: [
    { id: 'm1', date: '2026-11-07', kind: 'weight', value: 80.4, updatedAt: 1 },
    { id: 'm2', date: '2026-11-07', kind: 'waist', value: 92, updatedAt: 1 },
  ],
}

describe('the analysis, week by week', () => {
  it('starts on the week of the first log and ends on this one', () => {
    const weeks = buildAnalysis(data, today)
    expect(weeks.map((week) => week.monday)).toEqual(['2026-11-02', '2026-11-09'])
    expect(weeks.map((week) => week.inProgress)).toEqual([false, true])
    expect(buildAnalysis(base, today)).toEqual([])
  })

  it('counts habits, eating, energy, work, meds and the weigh-in', () => {
    const [week] = buildAnalysis(data, today)
    expect(week.habits.find((habit) => habit.label === 'Read')).toEqual({ label: 'Read', count: 2, target: 3 })
    expect(week.eating).toEqual({ mostly: 0, partly: 1, notReally: 0 })
    expect(week.energy).toEqual({ average: 2, days: 1 })
    expect(week.work).toEqual({ average: 3, days: 1, nothing: 0 })
    expect(week.meds).toEqual({ done: 1, of: 7 })
    expect(week.weight).toBe(80.4)
    expect(week.waist).toBe(92)
    expect(week.review).toEqual({ well: 'Walked every day', hard: 'Evenings', next: undefined, earlier: undefined })
  })

  it('keeps each day’s food diary and notes, but not notes on meds', () => {
    const [week] = buildAnalysis(data, today)
    const tuesday = week.days.find((day) => day.date === '2026-11-03')
    expect(tuesday).toMatchObject({ eating: 'partly', diary: 'Lentil soup\ncrisps at night', note: 'Long day', energy: 2, work: '3' })
    expect(tuesday?.notes).toEqual([{ what: 'Workout', text: 'Knees felt fine' }])
  })

  it('leaves out what’s turned off', () => {
    const [week] = buildAnalysis({ ...data, features: { ...ALL_FEATURES, food: false, diary: false, body: false } }, today)
    expect(week.eating).toBeUndefined()
    expect(week.weight).toBeUndefined()
    expect(week.days.find((day) => day.date === '2026-11-03')?.diary).toBeUndefined()
  })

  it('goes back only as far as asked', () => {
    const older = { ...data, entries: [...data.entries, entry('2026-08-03', 'note', 'Long ago')] }
    expect(buildAnalysis(older, today, 'all')).toHaveLength(15)
    expect(buildAnalysis(older, today, 4).map((week) => week.monday)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
  })
})

describe('the Markdown', () => {
  const weeks = buildAnalysis(data, today)
  const context = { generatedAt: '2026-11-11T09:30:00.000Z', guidelines: ['Protein at every meal'] }

  it('spells out dates so day and month never get mixed up', () => {
    expect(dayName('2026-11-03')).toBe('Tue 3 Nov 2026')
  })

  it('has the trends, the notes and the food diary', () => {
    const text = analysisMarkdown(weeks, ALL_PARTS, context)
    expect(text).toContain('# Planner data for analysis')
    expect(text).toContain('Mon 2 Nov 2026 to Wed 11 Nov 2026, 2 weeks')
    expect(text).toContain('## Food guidelines\n\n- Protein at every meal')
    expect(text).toContain('| Read | 2/3 |')
    expect(text).toContain('- Tue 3 Nov 2026 (eating partly, energy 2, work 3)')
    expect(text).toContain('  - Food: Lentil soup / crisps at night')
    expect(text).toContain('  - Workout: Knees felt fine')
    expect(text).toContain('- Went well: Walked every day')
    expect(text).toContain('### Week from Mon 9 Nov 2026 (still going)')
    expect(text).not.toContain('never shown')
  })

  it('leaves out the parts not asked for', () => {
    const trends = analysisMarkdown(weeks, { trends: true, notes: false, food: false }, context)
    expect(trends).toContain('## Weekly trends')
    expect(trends).not.toContain('Lentil soup')
    expect(trends).not.toContain('Walked every day')
    expect(trends).not.toContain('## Food guidelines')
    const food = analysisMarkdown(weeks, { trends: false, notes: false, food: true }, context)
    expect(food).not.toContain('## Weekly trends')
    expect(food).toContain('Lentil soup')
    expect(food).not.toContain('Long day')
  })

  it('says so when there is nothing', () => {
    expect(analysisMarkdown([], ALL_PARTS, context)).toContain('Nothing has been logged yet.')
  })
})

describe('on the device', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await setMeta('start', 'mine')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('exports from what’s saved', async () => {
    await db.entries.bulkPut(data.entries)
    const text = await analysisExport('all', ALL_PARTS, today)
    expect(text).toContain('Lentil soup')
  })

  it('keeps analyses you paste in, newest first, and deletes them so they sync', async () => {
    await addAnalysis('Older', 'First', '2026-10-01')
    await addAnalysis('  ', 'Second', '2026-11-01')
    expect((await listAnalyses()).map((row) => row.title)).toEqual(['Analysis', 'Older'])
    const [newest] = await listAnalyses()
    expect(newest).toMatchObject({ source: 'pasted', _dirty: 1 })
    await deleteAnalysis(newest.id)
    expect((await listAnalyses()).map((row) => row.title)).toEqual(['Older'])
  })

  it('sends the summary only while Connect an AI is on, and only the weeks that changed', async () => {
    const calls: { path: string; body: { weeks: { monday: string }[]; keep: string[] } }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ path: new URL(url).pathname, body: JSON.parse(String(init?.body)) })
        return new Response('{"stored":1}', { status: 200 })
      }),
    )
    const config = { server: 'https://planner-sync.test', key: 'k'.repeat(43) }
    await db.entries.bulkPut(data.entries)

    await sendAnalysis(config, today)
    expect(calls).toHaveLength(0)

    await setAiConnect(true)
    await sendAnalysis(config, today)
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/ai/weeks')
    expect(calls[0].body.weeks.map((week) => week.monday)).toEqual(['2026-11-02', '2026-11-09'])
    expect(calls[0].body.keep).toEqual(['2026-11-02', '2026-11-09'])

    // Nothing new: nothing sent.
    await sendAnalysis(config, today)
    expect(calls).toHaveLength(1)

    // A new diary entry this week: only this week goes.
    await db.entries.put(entry('2026-11-11', 'diary', 'Soup again'))
    await sendAnalysis(config, today)
    expect(calls[1].body.weeks.map((week) => week.monday)).toEqual(['2026-11-09'])
  })
})
