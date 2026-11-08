// Your data written out for an AI to analyse (F73): weekly trends, notes and the food diary, as
// plain Markdown any AI can read. The app's export and the server's connector (F74) both use
// this, so it imports nothing: the server bundles this same file.

export interface AnalysisNote {
  /** What the note is on: "Workout", a habit, a track. */
  what: string
  text: string
}

export interface AnalysisDay {
  /** YYYY-MM-DD */
  date: string
  eating?: 'mostly' | 'partly' | 'not really'
  diary?: string
  note?: string
  /** Notes on things done that day, and on track sessions. */
  notes?: AnalysisNote[]
  energy?: number
  /** "1"–"3", or "–" for nothing done. */
  work?: string
  period?: boolean
  crunch?: boolean
  weight?: number
  waist?: number
}

export interface AnalysisWeek {
  /** The week's Monday, YYYY-MM-DD. */
  monday: string
  /** The week still going: its numbers are so far. */
  inProgress: boolean
  crunchDays: number
  habits: { label: string; count: number; target: number | null }[]
  tracks: { name: string; days: number; minutes: number; steps: number }[]
  /** Left out when that part is turned off. */
  workouts?: { done: number; planned: number }
  eating?: { mostly: number; partly: number; notReally: number }
  energy?: { average: number | null; days: number }
  work?: { average: number | null; days: number; nothing: number }
  meds?: { done: number; of: number }
  weight?: number
  waist?: number
  periodDays?: number
  routinesDone: number
  tasksDone: number
  review: { well?: string; hard?: string; next?: string; earlier?: string }
  days: AnalysisDay[]
}

export interface AnalysisParts {
  trends: boolean
  notes: boolean
  food: boolean
}

export const ALL_PARTS: AnalysisParts = { trends: true, notes: true, food: true }

export interface AnalysisContext {
  /** When the data was put together, as an ISO time. */
  generatedAt: string
  /** The food guidelines in the person's own words, for reading the diary. */
  guidelines?: string[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const parts = (date: string) => date.split('-').map(Number) as [number, number, number]

/** "Mon 2 Nov 2026": spelled out, so no AI mixes up the day and the month. */
export function dayName(date: string): string {
  const [year, month, day] = parts(date)
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}`
}

const short = (date: string) => {
  const [, month, day] = parts(date)
  return `${day} ${MONTHS[month - 1]}`
}

const sundayOf = (monday: string) => {
  const [year, month, day] = parts(monday)
  return new Date(Date.UTC(year, month - 1, day + 6)).toISOString().slice(0, 10)
}

/** One line, safe inside a table cell or a list item. */
const flat = (text: string) => text.replace(/\s*\n+\s*/g, ' / ').replace(/\|/g, '/').trim()
const ratio = (done: number, of: number) => `${done}/${of}`
const percent = (done: number, of: number) => (of ? `${Math.round((done / of) * 100)}%` : '–')
const kg = (value: number | undefined) => (value === undefined ? '–' : `${value}`)

/** The weeks given (oldest first) as Markdown, with only the parts asked for. */
export function analysisMarkdown(weeks: readonly AnalysisWeek[], include: AnalysisParts, context: AnalysisContext): string {
  const out: string[] = []
  const first = weeks[0]
  const last = weeks[weeks.length - 1]
  const included = [include.trends && 'weekly trends', include.notes && 'notes', include.food && 'food diary'].filter(Boolean)

  out.push('# Planner data for analysis', '')
  if (!first || !last) {
    out.push('Nothing has been logged yet.')
    return out.join('\n')
  }
  out.push(
    `${dayName(first.monday)} to ${dayName(last.inProgress ? context.generatedAt.slice(0, 10) : sundayOf(last.monday))}, ${weeks.length} week${weeks.length === 1 ? '' : 's'}. ` +
      `Put together ${context.generatedAt.slice(0, 16).replace('T', ' ')} UTC. Includes: ${included.join(', ') || 'nothing'}.`,
    '',
    '**How to read it.** Weeks start on Monday; a day runs from 06:00 to 06:00.' +
      (last.inProgress ? ' The last week is still going, so its numbers are so far.' : '') +
      ' Habits are "done/target" for the week. Eating is the person’s own answer to “How did eating go?” against their food guidelines: mostly, partly or not really.' +
      ' Energy and work are rated 1–3 (work “–” means nothing got done). Crunch days are busy work days that don’t count against targets. Weight is in kg, waist in cm. A blank or “–” means nothing was logged.',
    '',
  )

  if (include.food && context.guidelines?.length) {
    out.push('## Food guidelines', '', ...context.guidelines.map((line) => `- ${flat(line)}`), '')
  }

  if (include.trends) {
    out.push('## Weekly trends', '')
    const optional = <K extends keyof AnalysisWeek>(key: K) => weeks.some((week) => week[key] !== undefined)
    const columns: { title: string; cell: (week: AnalysisWeek) => string }[] = [
      { title: 'Week from', cell: (week) => `${short(week.monday)}${week.inProgress ? ' (so far)' : ''}` },
      {
        title: 'Habits on target',
        cell: (week) => {
          const targeted = week.habits.filter((habit) => habit.target)
          return targeted.length ? ratio(targeted.filter((habit) => habit.count >= (habit.target ?? 0)).length, targeted.length) : '–'
        },
      },
    ]
    if (optional('workouts')) columns.push({ title: 'Workouts', cell: (week) => (week.workouts ? ratio(week.workouts.done, week.workouts.planned) : '–') })
    if (optional('eating')) {
      columns.push({
        title: 'Eating mostly / partly / not really',
        cell: (week) => (week.eating ? `${week.eating.mostly} / ${week.eating.partly} / ${week.eating.notReally}` : '–'),
      })
    }
    if (optional('energy')) columns.push({ title: 'Energy (avg, days)', cell: (week) => (week.energy?.average != null ? `${week.energy.average} (${week.energy.days})` : '–') })
    if (optional('work')) {
      columns.push({
        title: 'Work (avg, days, “–” days)',
        cell: (week) => (week.work && (week.work.days || week.work.nothing) ? `${week.work.average ?? '–'} (${week.work.days}, ${week.work.nothing})` : '–'),
      })
    }
    if (optional('meds')) columns.push({ title: 'Meds taken', cell: (week) => (week.meds ? percent(week.meds.done, week.meds.of) : '–') })
    if (optional('weight')) columns.push({ title: 'Weight', cell: (week) => kg(week.weight) })
    if (optional('waist')) columns.push({ title: 'Waist', cell: (week) => kg(week.waist) })
    if (optional('periodDays')) columns.push({ title: 'Period days', cell: (week) => `${week.periodDays ?? '–'}` })
    columns.push(
      { title: 'Crunch days', cell: (week) => `${week.crunchDays}` },
      { title: 'Routines done', cell: (week) => `${week.routinesDone}` },
      { title: 'Tasks done', cell: (week) => `${week.tasksDone}` },
    )
    out.push(table(columns.map((column) => column.title), weeks.map((week) => columns.map((column) => column.cell(week)))), '')

    const habitNames = [...new Set(weeks.flatMap((week) => week.habits.map((habit) => habit.label)))]
    if (habitNames.length) {
      out.push('### Habits by week', '')
      out.push(
        table(
          ['Habit', ...weeks.map((week) => short(week.monday))],
          habitNames.map((name) => [
            flat(name),
            ...weeks.map((week) => {
              const habit = week.habits.find((candidate) => candidate.label === name)
              if (!habit) return ''
              return habit.target ? ratio(habit.count, habit.target) : `${habit.count}`
            }),
          ]),
        ),
        '',
      )
    }
    const trackNames = [...new Set(weeks.flatMap((week) => week.tracks.map((track) => track.name)))]
    if (trackNames.length) {
      out.push('### Tracks by week', '', 'Days with a session, plus minutes and steps done where the track counts them.', '')
      out.push(
        table(
          ['Track', ...weeks.map((week) => short(week.monday))],
          trackNames.map((name) => [
            flat(name),
            ...weeks.map((week) => {
              const track = week.tracks.find((candidate) => candidate.name === name)
              if (!track) return '0'
              const extra = [track.minutes ? `${track.minutes} min` : '', track.steps ? `${track.steps} steps` : ''].filter(Boolean).join(', ')
              return `${track.days}${extra ? ` (${extra})` : ''}`
            }),
          ]),
        ),
        '',
      )
    }
  }

  if (include.notes || include.food) {
    out.push(`## ${include.notes && include.food ? 'Notes and food diary' : include.notes ? 'Notes' : 'Food diary'}, week by week`, '')
    for (const week of weeks) {
      const lines: string[] = []
      if (include.notes) {
        const review = [
          week.review.well && `Went well: ${flat(week.review.well)}`,
          week.review.hard && `Was hard: ${flat(week.review.hard)}`,
          week.review.next && `One thing for next week: ${flat(week.review.next)}`,
          week.review.earlier && `Review note: ${flat(week.review.earlier)}`,
        ].filter(Boolean)
        if (review.length) lines.push('**Weekly review**', ...review.map((line) => `- ${line}`), '')
      }
      const days: string[] = []
      for (const day of week.days) {
        const facts = [
          day.eating && `eating ${day.eating}`,
          day.energy !== undefined && `energy ${day.energy}`,
          day.work !== undefined && `work ${day.work}`,
          day.period && 'period',
          day.crunch && 'crunch day',
          day.weight !== undefined && `weight ${day.weight}`,
          day.waist !== undefined && `waist ${day.waist}`,
        ].filter(Boolean)
        const details: string[] = []
        if (include.food && day.diary) details.push(`  - Food: ${flat(day.diary)}`)
        if (include.notes && day.note) details.push(`  - Note: ${flat(day.note)}`)
        if (include.notes) for (const note of day.notes ?? []) details.push(`  - ${flat(note.what)}: ${flat(note.text)}`)
        if (!details.length && !(include.food && day.eating)) continue
        days.push(`- ${dayName(day.date)}${facts.length ? ` (${facts.join(', ')})` : ''}`, ...details)
      }
      if (days.length) lines.push(...days, '')
      if (!lines.length) continue
      out.push(`### Week from ${dayName(week.monday)}${week.inProgress ? ' (still going)' : ''}`, '', ...lines)
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}
