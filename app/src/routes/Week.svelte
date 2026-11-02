<script lang="ts">
  import { WEEKDAYS, formatDate, parseDate, toISODate } from '../lib/dates'
  import type { DrawingArea, DrawingLog, SpanishLog, Topic, Track } from '../lib/db'
  import { listDrawingAreas, listDrawingLogs } from '../lib/drawing'
  import { live } from '../lib/live.svelte'
  import { buildDay, weekDates } from '../lib/plan'
  import { getWeek, resetWeek, updateWeekDay } from '../lib/repo'
  import { DEFAULT_SPANISH, MORNING_BLOCKS, WORKOUTS, type DayTemplate, type MorningBlock, type SpanishKind, type WorkoutKind } from '../lib/setup'
  import { getSpanishSettings, listSpanishLogs } from '../lib/spanish'
  import { listTopics } from '../lib/study'
  import { trackSetup } from '../lib/trackSetup'
  import { listTracks } from '../lib/tracks'

  let { today }: { today: string } = $props()

  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const tracks = live(() => listTracks, [] as Track[])
  const topics = live(() => listTopics, [] as Topic[])
  const spanishLogs = live(() => listSpanishLogs, [] as SpanishLog[])
  const spanishSettings = live(() => getSpanishSettings, DEFAULT_SPANISH)
  const drawingAreas = live<DrawingArea[] | null>(() => listDrawingAreas, null)
  const drawingLogs = live(() => listDrawingLogs, [] as DrawingLog[])

  /** The Spanish choices, named for the editor. */
  const SPANISH_CHOICES: Record<SpanishKind, string> = { video: '1 video', exercise: 'Revise or exercises', reading: 'Reading' }

  let editing = $state(false)

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
        week: week.current ?? undefined,
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

  function reset() {
    if (window.confirm('Go back to the starting week? Your changes to the week are undone.')) void resetWeek()
  }
</script>

<header>
  <h1>This week</h1>
  <p class="date">{formatDate(days[0].plan.date)} – {formatDate(days[6].plan.date)}</p>
</header>

{#if editing}
  <p class="small">Your usual week. Changes apply to every week, and save as you go.</p>
  <ol class="days">
    {#each week.current ?? [] as day, index (index)}
      <li class="card daycard">
        <h2>{WEEKDAYS[index]}</h2>
        <div class="week-edit">
          <label>
            Morning
            <select value={day.morning} onchange={(event) => updateWeekDay(index, { morning: event.currentTarget.value as MorningBlock })}>
              {#each Object.entries(MORNING_BLOCKS) as [value, name] (value)}<option {value}>{name}</option>{/each}
            </select>
          </label>
          <label>
            Workout
            <select value={day.workout} onchange={(event) => updateWeekDay(index, { workout: event.currentTarget.value as WorkoutKind })}>
              {#each Object.entries(WORKOUTS) as [value, name] (value)}<option {value}>{name}</option>{/each}
            </select>
          </label>
          <label>
            Spanish
            <select
              value={day.spanish ?? ''}
              onchange={(event) => updateWeekDay(index, { spanish: (event.currentTarget.value || null) as SpanishKind | null })}
            >
              {#each Object.entries(SPANISH_CHOICES) as [value, name] (value)}<option {value}>{name}</option>{/each}
              <option value="">None</option>
            </select>
          </label>
          <label class="inline-check">
            <input type="checkbox" checked={day.foodRules} onchange={(event) => updateWeekDay(index, { foodRules: event.currentTarget.checked })} />
            Food rules
          </label>
          <label class="inline-check">
            <input type="checkbox" checked={day.weighIn} onchange={(event) => updateWeekDay(index, { weighIn: event.currentTarget.checked })} />
            Weigh-in
          </label>
        </div>
      </li>
    {/each}
  </ol>
  <div class="actions">
    <button type="button" class="button" onclick={() => (editing = false)}>Done</button>
    <button type="button" class="link" onclick={reset}>Back to the starting week</button>
  </div>
{:else}
  <ol class="days">
    {#each week.current ? days : [] as day (day.key)}
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

  <div class="actions">
    <button type="button" class="button secondary" onclick={() => (editing = true)}>Change the week</button>
  </div>
  <p class="muted small">Every day also has your med doses and the skin routine. Days run from 06:00 to 06:00.</p>
{/if}
