<script lang="ts">
  // The week (F30, F70): what each day holds. Each day lists activities: a track you picked, or
  // something in your own words, with a part of the day and a short note. Workout, food
  // guidelines, weigh-in and the weekly review are per-day settings when they're on.
  import { activityId, dayActivities, isReviewDay } from '../lib/activities'
  import { WEEKDAYS, formatDate, parseDate, toISODate } from '../lib/dates'
  import type { Topic, Track, TrackSession } from '../lib/db'
  import { DEFAULT_EXERCISE } from '../lib/exercise'
  import { ALL_FEATURES } from '../lib/features'
  import { live } from '../lib/live.svelte'
  import { buildDay, weekDates } from '../lib/plan'
  import { getExercise, getFeatures, getWeek, resetWeek, updateWeekDay } from '../lib/repo'
  import { WORKOUTS, type Activity, type ActivityLog, type DayTemplate, type TimeOfDay, type WorkoutKind } from '../lib/setup'
  import { getStart, type StartMode } from '../lib/start'
  import { listAllSteps, listSessions, listTracks } from '../lib/tracks'

  let { today }: { today: string } = $props()

  const exercise = live(() => getExercise, DEFAULT_EXERCISE)
  const features = live(() => getFeatures, ALL_FEATURES)
  const on = $derived(features.current)
  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const tracks = live(() => listTracks, [] as Track[])
  const steps = live(() => listAllSteps, [] as Topic[])
  const sessions = live(() => listSessions, [] as TrackSession[])
  const start = live<StartMode | null>(() => getStart, null)

  const PARTS: { id: TimeOfDay; label: string }[] = [
    { id: 'morning', label: 'Morning' },
    { id: 'anytime', label: 'Any time' },
    { id: 'evening', label: 'Evening' },
  ]
  const LOGS: { id: ActivityLog; label: string }[] = [
    { id: 'done', label: 'Just done' },
    { id: 'step', label: 'Next step' },
    { id: 'minutes', label: 'Minutes' },
    { id: 'pages', label: 'Pages' },
  ]
  const NEW_OWN = '__own__'

  let editing = $state(false)

  const days = $derived(
    weekDates(parseDate(today)).map((date) => {
      const key = toISODate(date)
      const plan = buildDay(date, {
        week: week.current ?? undefined,
        tracks: tracks.current,
        steps: steps.current,
        sessions: sessions.current,
        exercise: exercise.current,
        features: features.current,
      })
      // Show what's specific to each day; meds are the same every day.
      const items = [...plan.morning, ...plan.anytime, ...plan.evening].filter((item) => !item.id.startsWith('med-'))
      return { key, plan, items, isToday: key === today }
    }),
  )

  /** A day's activities as they are now; changing one saves the day's list (F70). */
  const activitiesOf = (day: DayTemplate, index: number) => dayActivities(day, index, tracks.current)
  const trackOf = (activity: Activity) => tracks.current.find((track) => track.id === activity.trackId)

  function saveActivities(index: number, day: DayTemplate, activities: Activity[]) {
    // A day changed here keeps its review as it was.
    void updateWeekDay(index, { activities, review: isReviewDay(day) })
  }

  function changeActivity(index: number, day: DayTemplate, id: string, changes: Partial<Activity>) {
    saveActivities(
      index,
      day,
      activitiesOf(day, index).map((activity) => (activity.id === id ? { ...activity, ...changes } : activity)),
    )
  }

  function removeActivity(index: number, day: DayTemplate, id: string) {
    saveActivities(
      index,
      day,
      activitiesOf(day, index).filter((activity) => activity.id !== id),
    )
  }

  function addActivity(index: number, day: DayTemplate, choice: string) {
    if (!choice) return
    const track = tracks.current.find((candidate) => candidate.id === choice)
    const activity: Activity = track
      ? { id: activityId(), part: 'anytime', trackId: track.id, log: track.steps ? 'step' : track.milestones ? 'minutes' : 'done' }
      : { id: activityId(), part: 'anytime', text: '', log: 'done' }
    saveActivities(index, day, [...activitiesOf(day, index), activity])
  }

  function reset() {
    if (window.confirm('Go back to the starting week? Your changes to the week are undone.')) void resetWeek()
  }
</script>

<header>
  <h1>This week</h1>
  <p class="date">{formatDate(days[0].plan.date)} – {formatDate(days[6].plan.date)}</p>
</header>

{#if editing}
  <p class="small">Your usual week. Add activities to each day: a track, or something in your own words. Changes apply to every week and save as you go.</p>
  <ol class="days">
    {#each week.current ?? [] as day, index (index)}
      <li class="card daycard">
        <h2>{WEEKDAYS[index]}</h2>
        <ul class="plain activity-list">
          {#each activitiesOf(day, index) as activity (activity.id)}
            {@const track = trackOf(activity)}
            <li class="activity-edit">
              <div class="activity-head">
                {#if activity.trackId}
                  <span class="label grow">{track?.name ?? 'A deleted track'}</span>
                {:else}
                  <input
                    class="grow"
                    type="text"
                    value={activity.text ?? ''}
                    placeholder="e.g. Guitar, 20 min"
                    aria-label="Activity on {WEEKDAYS[index]}"
                    onchange={(event) => changeActivity(index, day, activity.id, { text: event.currentTarget.value.trim() })}
                  />
                {/if}
                <button type="button" class="remove" aria-label="Remove {track?.name ?? activity.text ?? 'activity'} from {WEEKDAYS[index]}" onclick={() => removeActivity(index, day, activity.id)}
                  >×</button
                >
              </div>
              <div class="activity-fields">
                <select value={activity.part} aria-label="When" onchange={(event) => changeActivity(index, day, activity.id, { part: event.currentTarget.value as TimeOfDay })}>
                  {#each PARTS as part (part.id)}<option value={part.id}>{part.label}</option>{/each}
                </select>
                <input
                  type="text"
                  value={activity.note ?? ''}
                  placeholder="Note for the day"
                  aria-label="Note for {WEEKDAYS[index]}"
                  onchange={(event) => changeActivity(index, day, activity.id, { note: event.currentTarget.value.trim() || undefined })}
                />
                {#if activity.trackId}
                  <select value={activity.log} aria-label="What it logs" onchange={(event) => changeActivity(index, day, activity.id, { log: event.currentTarget.value as ActivityLog })}>
                    {#each LOGS.filter((log) => log.id !== 'step' || track?.steps) as log (log.id)}<option value={log.id}>{log.label}</option>{/each}
                  </select>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        <label class="add-activity">
          <span class="visually-hidden">Add an activity on {WEEKDAYS[index]}</span>
          <select
            value=""
            aria-label="Add an activity on {WEEKDAYS[index]}"
            onchange={(event) => {
              addActivity(index, day, event.currentTarget.value)
              event.currentTarget.value = ''
            }}
          >
            <option value="">+ Add an activity…</option>
            {#each tracks.current as track (track.id)}<option value={track.id}>{track.name}</option>{/each}
            <option value={NEW_OWN}>Something in your own words</option>
          </select>
        </label>
        <div class="week-edit">
          {#if on.exercise}
            <label>
              Workout
              <select value={day.workout} onchange={(event) => updateWeekDay(index, { workout: event.currentTarget.value as WorkoutKind })}>
                {#each Object.entries(WORKOUTS) as [value, name] (value)}<option {value}>{name}</option>{/each}
              </select>
            </label>
          {/if}
          {#if on.food}
            <label class="inline-check">
              <input type="checkbox" checked={day.foodRules} onchange={(event) => updateWeekDay(index, { foodRules: event.currentTarget.checked })} />
              Food guidelines
            </label>
          {/if}
          {#if on.body}
            <label class="inline-check">
              <input type="checkbox" checked={day.weighIn} onchange={(event) => updateWeekDay(index, { weighIn: event.currentTarget.checked })} />
              Weigh-in
            </label>
          {/if}
          <label class="inline-check">
            <input type="checkbox" checked={isReviewDay(day)} onchange={(event) => updateWeekDay(index, { review: event.currentTarget.checked, activities: activitiesOf(day, index) })} />
            Weekly review
          </label>
        </div>
      </li>
    {/each}
  </ol>
  <div class="actions">
    <button type="button" class="button" onclick={() => (editing = false)}>Done</button>
    {#if start.current === 'mine'}<button type="button" class="link" onclick={reset}>Back to the starting week</button>{/if}
    <a href="#/tracks">Your tracks</a>
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
          {#if on.food}<li>{day.plan.foodRules ? 'Food guidelines' : 'Free day: food guidelines off'}</li>{/if}
          {#if !day.items.length && !on.food}<li class="muted">Nothing planned</li>{/if}
        </ul>
      </li>
    {/each}
  </ol>

  <div class="actions">
    <button type="button" class="button secondary" onclick={() => (editing = true)}>Change the week</button>
  </div>
  <p class="muted small">Every day also has your med doses and the habits under "Also today". Days run from 06:00 to 06:00.</p>
{/if}
