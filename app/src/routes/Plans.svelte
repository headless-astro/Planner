<script lang="ts">
  // The Plans sub-tab (F33): a short "now and next" for each plan. Each title opens the full page.
  import Icon, { type IconName } from '../components/Icon.svelte'
  import PlansNav from '../components/PlansNav.svelte'
  import { addDays, parseDate, toISODate, weekStart, weekdayIndex } from '../lib/dates'
  import type { DrawingArea, DrawingLog, SpanishLog, Topic, Track, TrackSession } from '../lib/db'
  import { drawingAreaFor, listDrawingAreas, listDrawingLogs } from '../lib/drawing'
  import { live } from '../lib/live.svelte'
  import { daysWith } from '../lib/plan'
  import { getWeek } from '../lib/repo'
  import { DEFAULT_SPANISH, MORNING_BLOCKS, WORKOUTS, type DayTemplate } from '../lib/setup'
  import { bookState, dsProgress, getSpanishSettings, listSpanishLogs, nextBookSession, videoMinutes } from '../lib/spanish'
  import { listTopics, studyProgress } from '../lib/study'
  import { comingDays, dayLabel, nextDayWhere, trackNow } from '../lib/summary'
  import { listSessions, listTracks } from '../lib/tracks'

  let { today }: { today: string } = $props()

  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const topics = live(() => listTopics, [] as Topic[])
  const spanishLogs = live(() => listSpanishLogs, [] as SpanishLog[])
  const spanishSettings = live(() => getSpanishSettings, DEFAULT_SPANISH)
  const areas = live(() => listDrawingAreas, [] as DrawingArea[])
  const drawingLogs = live(() => listDrawingLogs, [] as DrawingLog[])
  const tracks = live(() => listTracks, [] as Track[])
  const sessions = live(() => listSessions, [] as TrackSession[])

  const days = $derived(week.current ?? [])
  const when = (test: (day: DayTemplate) => boolean) => {
    const date = nextDayWhere(days, today, test)
    return date ? dayLabel(date, today) : null
  }

  // The week: today and the six days after it.
  const coming = $derived(
    comingDays(today).map((date) => {
      const day = days[weekdayIndex(parseDate(date))]
      const parts = day ? [MORNING_BLOCKS[day.morning], day.workout === 'rest' ? 'Rest day' : WORKOUTS[day.workout]] : []
      return { date, label: dayLabel(date, today), text: parts.filter((part) => part && part !== 'Free').join(' · ') }
    }),
  )

  // Tech study.
  const nextTopic = $derived(topics.current.find((topic) => !topic.doneDate) ?? null)
  const study = $derived(studyProgress(topics.current, today, daysWith(days, 'tech').length))
  const revision = $derived(topics.current.filter((topic) => topic.needsRevision).length)
  const studyNext = $derived(when((day) => day.morning === 'tech'))

  // Spanish.
  const book = $derived(nextBookSession(bookState(spanishLogs.current, spanishSettings.current), spanishSettings.current))
  const bookNext = $derived(when((day) => day.morning === 'spanish-book'))
  const monday = $derived(toISODate(weekStart(parseDate(today))))
  const weekMinutes = $derived(videoMinutes(spanishLogs.current.filter((log) => log.date >= monday && log.date <= today)))
  const ds = $derived(dsProgress(videoMinutes(spanishLogs.current)))

  // Drawing.
  const area = $derived(drawingAreaFor(areas.current, drawingLogs.current, today))
  const fourWeeksAgo = $derived(toISODate(addDays(parseDate(today), -27)))
  const recentDrawing = $derived(drawingLogs.current.filter((log) => log.date >= fourWeeksAgo && log.date <= today).length)
  const drawingNext = $derived(when((day) => day.morning === 'drawing'))

  // Practice tracks.
  const trackRows = $derived(
    tracks.current.map((track) => ({
      track,
      now: trackNow(track, today),
      count: sessions.current.filter((session) => session.trackId === track.id).length,
    })),
  )
  const activeTracks = $derived(trackRows.filter((row) => row.now.state !== 'finished'))
  const finishedTracks = $derived(trackRows.filter((row) => row.now.state === 'finished'))

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
</script>

{#snippet title(icon: IconName, text: string, href: string)}
  <a class="plan-title" {href}>
    <Icon name={icon} />
    <span class="grow">{text}</span>
    <span class="chevron" aria-hidden="true">›</span>
  </a>
{/snippet}

<PlansNav current="plans" />

<header>
  <h1>Plans</h1>
  <p class="date">Where each plan is and what's next. Tap a title for the full page.</p>
</header>

<section class="card plan-card">
  {@render title('calendar-dots', 'Week plan', '#/week')}
  {#if week.current}
    <ul class="plain plan-days">
      {#each coming as day (day.date)}
        <li class:is-today={day.date === today}>
          <span class="plan-day">{day.label}</span>
          <span class="small">{day.text || 'Free'}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="card plan-card">
  {@render title('books', 'Tech study', '#/study')}
  {#if nextTopic}
    <p class="plan-now">Next: #{nextTopic.number} {nextTopic.title}</p>
  {:else if topics.current.length}
    <p class="plan-now">Every topic is done.</p>
  {/if}
  <p class="small muted">
    {study.done} of {study.total} topics done{studyNext ? ` · next session: ${studyNext}` : ''}{revision ? ` · ${revision} to revise` : ''}
  </p>
</section>

<section class="card plan-card">
  {@render title('books', 'Spanish', '#/spanish')}
  <p class="plan-now">Book: {book}{bookNext ? ` · ${bookNext}` : ''}</p>
  <p class="small muted">
    {weekMinutes} min of video this week · level {ds.level}{ds.nextLevel !== null && ds.hoursToNext !== null
      ? `, ${ds.hoursToNext.toFixed(1)} h to level ${ds.nextLevel}`
      : ''}
  </p>
</section>

<section class="card plan-card">
  {@render title('books', 'Drawing', '#/drawing')}
  <p class="plan-now">This week: {area?.name ?? 'no areas yet'}{drawingNext ? ` · ${drawingNext}` : ''}</p>
  <p class="small muted">{plural(recentDrawing, 'session')} in the last 4 weeks</p>
</section>

{#each activeTracks as row (row.track.id)}
  <section class="card plan-card">
    {@render title('books', row.track.name, '#/tracks')}
    <p class="plan-now">{row.now.status}{row.now.next ? ` · next: ${dayLabel(row.now.next, today)}` : ''}</p>
    <p class="small muted">{row.now.focus ? `Focus: ${row.now.focus} · ` : ''}{plural(row.count, 'session')} so far</p>
  </section>
{/each}

<section class="card plan-card">
  {@render title('books', activeTracks.length ? 'More practice' : 'Practice', '#/tracks')}
  <p class="small muted">
    {#if finishedTracks.length}Finished: {finishedTracks.map((row) => row.track.name).join(', ')}.{/if}
    Short tracks like the driving month. Add one on the Practice page.
  </p>
</section>
