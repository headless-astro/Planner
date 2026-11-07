<script lang="ts">
  // The Plans sub-tab (F33, F69): your week, then a short "now and next" for each track. Each
  // title opens the full page.
  import Icon, { type IconName } from '../components/Icon.svelte'
  import PlansNav from '../components/PlansNav.svelte'
  import { dayActivities, scheduledThings } from '../lib/activities'
  import { addDays, parseDate, toISODate, weekStart, weekdayIndex } from '../lib/dates'
  import type { Topic, Track, TrackSession } from '../lib/db'
  import { DEFAULT_EXERCISE } from '../lib/exercise'
  import { ALL_FEATURES } from '../lib/features'
  import { live } from '../lib/live.svelte'
  import { buildDay } from '../lib/plan'
  import { getExercise, getFeatures, getWeek } from '../lib/repo'
  import type { DayTemplate } from '../lib/setup'
  import { comingDays, dayLabel } from '../lib/summary'
  import { focusFor, hoursOf, isRunning, listAllSteps, listSessions, listTracks, milestoneProgress, stepsOf, trackStatus } from '../lib/tracks'

  let { today }: { today: string } = $props()

  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const features = live(() => getFeatures, ALL_FEATURES)
  const exercise = live(() => getExercise, DEFAULT_EXERCISE)
  const tracks = live(() => listTracks, [] as Track[])
  const steps = live(() => listAllSteps, [] as Topic[])
  const sessions = live(() => listSessions, [] as TrackSession[])

  // The week: today and the six days after it, with what's on each.
  const coming = $derived(
    comingDays(today).map((date) => {
      const plan = buildDay(parseDate(date), {
        week: week.current ?? undefined,
        tracks: tracks.current,
        steps: steps.current,
        sessions: sessions.current,
        exercise: exercise.current,
        features: features.current,
        doses: [],
      })
      const labels = [...plan.morning, ...plan.anytime, ...plan.evening]
        .filter((item) => item.activity || item.id === 'workout' || item.id === 'review')
        .map((item) => (item.id === 'workout' ? item.label.replace('Workout → ', '') : item.trackId ? (tracks.current.find((track) => track.id === item.trackId)?.name ?? item.label) : item.label))
      // A track on twice in a day (Spanish's book and video) is named once.
      return { date, label: dayLabel(date, today), text: [...new Set(labels)].join(' · ') }
    }),
  )

  const monday = $derived(toISODate(weekStart(parseDate(today))))
  const sunday = $derived(toISODate(addDays(parseDate(monday), 6)))
  const scheduled = $derived(week.current ? scheduledThings(week.current, tracks.current) : [])

  /** Each track: where it is, what's next, and how this week is going. */
  const rows = $derived(
    tracks.current.map((track) => {
      const own = sessions.current.filter((session) => session.trackId === track.id)
      const trackSteps = stepsOf(track.id, steps.current)
      const status = trackStatus(track, today)
      const days = scheduled.find((thing) => thing.trackId === track.id)?.weekdays.length ?? 0
      const target = track.target ?? days
      const thisWeek = new Set(own.filter((session) => session.date >= monday && session.date <= sunday).map((session) => session.date)).size
      // The next day it's on, within two weeks.
      const next = comingDays(today, 14).find((date) => {
        const weekday = weekdayIndex(parseDate(date))
        const day = week.current?.[weekday]
        return !!day && isRunning(track, date) && dayActivities(day, weekday, tracks.current).some((activity) => activity.trackId === track.id)
      })
      return {
        track,
        status,
        nextStep: track.steps ? (trackSteps.find((step) => !step.doneDate) ?? null) : null,
        stepsDone: trackSteps.filter((step) => step.doneDate).length,
        stepsTotal: trackSteps.length,
        focus: focusFor(track, own, today),
        progress: track.milestones ? milestoneProgress(hoursOf(own), track.milestones) : null,
        thisWeek,
        target,
        next: next ? dayLabel(next, today) : null,
      }
    }),
  )
  const current = $derived(rows.filter((row) => row.status.state !== 'finished'))
  const finished = $derived(rows.filter((row) => row.status.state === 'finished'))
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
  <p class="date">Your week, and where each track is. Tap a title for the full page.</p>
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

{#each current as row (row.track.id)}
  <section class="card plan-card">
    {@render title('books', row.track.name, `#/track/${row.track.id}`)}
    {#if row.nextStep}
      <p class="plan-now">Next: {row.nextStep.title}</p>
    {:else if row.focus}
      <p class="plan-now">This week: {row.focus.name}</p>
    {:else if row.track.steps && row.stepsTotal}
      <p class="plan-now">Every step is done.</p>
    {:else}
      <p class="plan-now">{row.status.text}</p>
    {/if}
    <p class="small muted">
      {[
        row.track.steps && row.stepsTotal ? `${row.stepsDone} of ${row.stepsTotal} steps` : '',
        row.progress ? `${row.progress.hours.toFixed(1)} h${row.progress.reached ? ` · ${row.progress.reached}` : ''}` : '',
        row.target ? `${row.thisWeek} of ${row.target} this week` : `${row.thisWeek} this week`,
        row.next ? `next: ${row.next}` : 'not on your week',
        !row.track.ongoing && row.status.state === 'running' ? row.status.text : row.status.state === 'upcoming' ? row.status.text : '',
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
  </section>
{/each}

{#if finished.length}
  <p class="small muted">Finished: {finished.map((row) => row.track.name).join(', ')}.</p>
{/if}

<p class="add-practice">
  <a class="button secondary" href="#/tracks/new"><Icon name="plus" />Add a track</a>
  {#if tracks.current.length}<a class="small" href="#/tracks">All tracks</a>{/if}
</p>
{#if !tracks.current.length}
  <p class="muted small">Tracks are anything you work at: a course, a language, a practice. Add one, then put it on your week.</p>
{/if}
