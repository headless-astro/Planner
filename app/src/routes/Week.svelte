<script lang="ts">
  import { formatDate, parseDate, toISODate } from '../lib/dates'
  import type { DrawingArea, DrawingLog, SpanishLog, Topic, Track } from '../lib/db'
  import { listDrawingAreas, listDrawingLogs } from '../lib/drawing'
  import { live } from '../lib/live.svelte'
  import { buildDay, weekDates } from '../lib/plan'
  import { DEFAULT_SPANISH } from '../lib/setup'
  import { getSpanishSettings, listSpanishLogs } from '../lib/spanish'
  import { listTopics } from '../lib/study'
  import { trackSetup } from '../lib/trackSetup'
  import { listTracks } from '../lib/tracks'

  let { today }: { today: string } = $props()

  const tracks = live(() => listTracks, [] as Track[])
  const topics = live(() => listTopics, [] as Topic[])
  const spanishLogs = live(() => listSpanishLogs, [] as SpanishLog[])
  const spanishSettings = live(() => getSpanishSettings, DEFAULT_SPANISH)
  const drawingAreas = live<DrawingArea[] | null>(() => listDrawingAreas, null)
  const drawingLogs = live(() => listDrawingLogs, [] as DrawingLog[])

  const days = $derived(
    weekDates(parseDate(today)).map((date) => {
      const key = toISODate(date)
      const slots = trackSetup(key, {
        topics: topics.current,
        spanishLogs: spanishLogs.current,
        spanishSettings: spanishSettings.current,
        drawingAreas: drawingAreas.current,
        drawingLogs: drawingLogs.current,
      })
      const plan = buildDay(date, {
        tracks: tracks.current,
        studyTopic: slots.studyTopic,
        bookSession: slots.bookSession,
        drawingArea: slots.drawingArea,
      })
      // Show what's specific to each day; meds and the skin routine are the same every day.
      const items = [...plan.morning, ...plan.anytime].filter((item) => !item.id.startsWith('med-') && item.id !== 'skin')
      return { key, plan, items, isToday: key === today }
    }),
  )
</script>

<header>
  <h1>This week</h1>
  <p class="date">{formatDate(days[0].plan.date)} – {formatDate(days[6].plan.date)}</p>
</header>

<ol class="days">
  {#each days as day (day.key)}
    <li class="card daycard" class:today={day.isToday}>
      <h2>
        <a href="#/day/{day.key}">{day.plan.weekday}</a>
        <span class="muted">{day.plan.dateText}</span>
        {#if day.isToday}<span class="badge">Today</span>{/if}
      </h2>
      <ul>
        {#each day.items as item (item.id)}
          <li>{item.label}</li>
        {/each}
        <li>{day.plan.foodRules ? 'Food rules' : 'Free day: food rules off'}</li>
      </ul>
    </li>
  {/each}
</ol>

<p class="muted small">Every day also has your med doses and the skin routine. Days run from 06:00 to 06:00.</p>
