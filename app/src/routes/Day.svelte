<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { DEFAULT_EXERCISE } from '../lib/exercise'
  import { ALL_FEATURES } from '../lib/features'
  import { countCrunchDays, endCrunch, isCrunchDay, listCrunches, startCrunch } from '../lib/crunch'
  import { addDays, formatShort, parseDate, toISODate, weekStart } from '../lib/dates'
  import type { Crunch, Dose, Entry, Habit, Task, Topic, Track, TrackSession } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { buildDay, type PlanItem } from '../lib/plan'
  import {
    addTodo,
    clearEntry,
    deleteTodo,
    getDayMeasurements,
    getDayValues,
    getEntriesBetween,
    getFoodRules,
    getExercise,
    getFeatures,
    getTargets,
    getTracking,
    getTodos,
    getWeek,
    listDoses,
    listHabits,
    moveTodo,
    setEntry,
    setMeasurement,
    setTodoDone,
    toggleTick,
    type DayMeasurements,
    type DayValues,
  } from '../lib/repo'
  import { dueText, getRoutineStatuses, setRoutineDone, type RoutineStatus } from '../lib/routines'
  import { DEFAULT_FOOD_RULES, DEFAULT_TARGETS, type DayTemplate } from '../lib/setup'
  import { dueLabel, getDueTasks, setTaskDone, type DueTask } from '../lib/tasks'
  import { listAllSteps, listSessions, listTracks, saveSession, sessionFor, setActivityDone, stepsOf } from '../lib/tracks'
  import { EATING_CHOICES, countText, weekCounters } from '../lib/week'

  let { date, isToday = false }: { date: string; isToday?: boolean } = $props()

  /** Late routines shown on Today before the rest fold into a link. */
  const MAX_LATE_ROUTINES = 4

  const monday = $derived(toISODate(weekStart(parseDate(date))))
  const sunday = $derived(toISODate(addDays(parseDate(monday), 6)))

  // Read live from the database on this device, so the screen updates the moment anything is saved.
  const doses = live(() => listDoses, [] as Dose[])
  const habits = live(() => listHabits, [] as Habit[])
  const targets = live(() => getTargets, DEFAULT_TARGETS)
  // Null until loaded, so the day isn't laid out from the starting week for a moment.
  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const foodRules = live(() => getFoodRules, DEFAULT_FOOD_RULES)
  const tracking = live(() => getTracking, { periods: false })
  const exercise = live(() => getExercise, DEFAULT_EXERCISE)
  const features = live(() => getFeatures, ALL_FEATURES)
  const on = $derived(features.current)
  const tracks = live(() => listTracks, [] as Track[])
  const crunches = live(() => listCrunches, [] as Crunch[])
  const values = live(() => () => getDayValues(date), {} as DayValues)
  const todos = live(() => () => getTodos(date, isToday), [] as Task[])
  const dueTasks = live(() => () => getDueTasks(date, isToday), [] as DueTask[])
  const routines = live(() => () => getRoutineStatuses(date), [] as RoutineStatus[])
  const allSessions = live(() => listSessions, [] as TrackSession[])
  const steps = live(() => listAllSteps, [] as Topic[])
  const body = live(() => () => getDayMeasurements(date), {} as DayMeasurements)
  const weekEntries = live(() => {
    const from = monday
    const to = sunday
    return () => getEntriesBetween(from, to)
  }, [] as Entry[])

  const plan = $derived(
    buildDay(parseDate(date), {
      week: week.current ?? undefined,
      doses: doses.current,
      tracks: tracks.current,
      steps: steps.current,
      sessions: allSessions.current,
      exercise: exercise.current,
      features: features.current,
    }),
  )
  const crunchDay = $derived(isCrunchDay(crunches.current, date))
  const counters = $derived(
    weekCounters(weekEntries.current, habits.current, targets.current, countCrunchDays(crunches.current, monday, sunday), features.current, {
      monday,
      week: week.current ?? [],
      tracks: tracks.current,
      sessions: allSessions.current.filter((session) => session.date >= monday && session.date <= sunday),
    }),
  )

  // Routines: on today, the ones due or late (the latest few) plus the ones done; on other days,
  // the ones done that day.
  const lateRoutines = $derived(
    routines.current
      .filter((status) => !status.doneThatDay && status.dueIn !== null && status.dueIn <= 0)
      .sort((a, b) => (a.dueIn ?? 0) - (b.dueIn ?? 0)),
  )
  const shownRoutines = $derived([
    ...(isToday ? lateRoutines.slice(0, MAX_LATE_ROUTINES) : []),
    ...routines.current.filter((status) => status.doneThatDay),
  ])
  const hiddenRoutines = $derived(isToday ? Math.max(0, lateRoutines.length - MAX_LATE_ROUTINES) : 0)
  const notStarted = $derived(routines.current.filter((status) => status.lastDone === null).length)

  let newTodo = $state('')

  const ticked = (id: string) => values.current[`tick:${id}`] === true

  // ── The day's three parts as tabs (F44) ──
  type Part = 'morning' | 'anytime' | 'evening'
  const PARTS: { id: Part; label: string }[] = [
    { id: 'morning', label: 'Morning' },
    { id: 'anytime', label: 'Any time' },
    { id: 'evening', label: 'Evening' },
  ]

  /** A track's session for one of the day's activities (F70). */
  const sessionOf = (item: PlanItem) => (item.trackId ? sessionFor(allSessions.current, item.trackId, date, item.activity?.id) : undefined)

  function itemDone(item: PlanItem): boolean {
    if (item.id === 'weigh-in') return body.current.weight !== undefined && body.current.weight !== null
    if (item.trackId) return !!sessionOf(item)
    return ticked(item.tickKey ?? item.id)
  }

  /** Ticks a track's activity: a session, the day's step, the week's focus (F69). */
  async function tickActivity(item: PlanItem) {
    const track = tracks.current.find((candidate) => candidate.id === item.trackId)
    if (!track || !item.activity) return
    await setActivityDone(track, item.activity, date, !sessionOf(item), {
      steps: stepsOf(track.id, steps.current),
      sessions: allSessions.current.filter((session) => session.trackId === track.id),
    })
  }

  /** Saves what you note on a track's session, keeping it on the session that's there. */
  function saveDetails(item: PlanItem, details: Parameters<typeof saveSession>[2]) {
    const session = sessionOf(item)
    if (item.trackId) void saveSession(item.trackId, date, details, session ? session.activityId : item.activity?.id)
  }

  /** Done and total for each part. Any time also holds routines, list tasks and to-dos. */
  const progress = $derived.by(() => {
    const count = (items: PlanItem[]) => ({ done: items.filter(itemDone).length, total: items.length })
    const anytime = count(plan.anytime)
    anytime.done +=
      shownRoutines.filter((status) => status.doneThatDay).length +
      dueTasks.current.filter((due) => due.task.done).length +
      todos.current.filter((todo) => todo.done).length
    anytime.total += shownRoutines.length + dueTasks.current.length + todos.current.length
    return { morning: count(plan.morning), anytime, evening: count(plan.evening) }
  })

  /** The part that fits the time of day: the day turns over at 06:00, and mornings start late (A24). */
  function partOfDay(): Part {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 15) return 'morning'
    if (hour >= 15 && hour < 21) return 'anytime'
    return 'evening'
  }

  const hasLeft = (id: Part) => progress[id].done < progress[id].total
  /** Today opens on the part for the time of day, or else on the first with something left. */
  const suggestedPart = $derived.by((): Part => {
    if (!isToday) return 'morning'
    const now = partOfDay()
    if (hasLeft(now)) return now
    return PARTS.find((candidate) => hasLeft(candidate.id))?.id ?? now
  })
  // Once you tap anything, the part stays put, so ticking the last item doesn't move you.
  let chosenPart = $state<Part | null>(null)
  const part = $derived(chosenPart ?? suggestedPart)
  const keepPart = () => (chosenPart ??= part)

  /** Plain ticks: meds, the workout, the review, and your own activities (kept under their name). */
  async function tick(item: PlanItem) {
    await toggleTick(date, item.tickKey ?? item.id)
  }

  function storedText(key: string): string {
    const value = values.current[key]
    return typeof value === 'string' ? value : ''
  }

  /** Period days (F56), only when tracking is on in Settings. */
  async function togglePeriod() {
    if (values.current.period === true) await clearEntry(date, 'period')
    else await setEntry(date, 'period', true)
  }

  async function choose(key: 'rules' | 'work' | 'energy', value: string) {
    if (values.current[key] === value) await clearEntry(date, key)
    else await setEntry(date, key, value)
  }

  function toNumber(text: string): number | null {
    const value = Number.parseFloat(text.replace(',', '.'))
    return Number.isFinite(value) ? value : null
  }

  async function submitTodo(event: SubmitEvent) {
    event.preventDefault()
    const title = newTodo.trim()
    if (!title) return
    newTodo = ''
    await addTodo(title, date)
  }

  function todoDetail(todo: Task): string {
    if (!todo.done && todo.date && todo.date < date) return `to-do · from ${formatShort(parseDate(todo.date))}`
    return 'to-do'
  }

  // The diary and note save half a second after you stop typing. While you type, your text
  // wins over what's stored, so a save landing mid-word can't undo a keystroke.
  let drafts = $state<Record<string, string>>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Where each draft is saved. By default it's a value for the day under its key. */
  const savers = new Map<string, (text: string) => Promise<void>>()

  const saveEntry = (key: string) => (text: string) => (text.trim() ? setEntry(date, key, text) : clearEntry(date, key))

  function editText(key: string, text: string, save = saveEntry(key)) {
    drafts[key] = text
    savers.set(key, save)
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => void saveText(key), 500))
  }

  async function saveText(key: string) {
    clearTimeout(timers.get(key))
    timers.delete(key)
    const text = drafts[key]
    if (text === undefined) return
    await (savers.get(key) ?? saveEntry(key))(text)
  }

  // ── Notes on what you did (F31): any ticked item except meds. A track's session keeps its own
  // notes (what you did, how it felt), so the track's page shows them.
  const doseIds = $derived(new Set(doses.current.map((dose) => dose.id)))
  const takesNote = (item: PlanItem) => !doseIds.has(item.id) && item.id !== 'weigh-in' && !item.trackId

  const storedNote = (item: PlanItem) => storedText(`note:${item.id}`)
  const noteSaver = (item: PlanItem) => saveEntry(`note:${item.id}`)

  const NOTE_HINTS: Record<string, string> = {
    workout: 'What you did, and how it felt…',
  }

  async function finishText(key: string) {
    await saveText(key)
    delete drafts[key]
  }

  // Save unsaved text when the app goes to the background or this day closes.
  $effect(() => {
    const saveAll = () => {
      for (const key of Object.keys(drafts)) void saveText(key)
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveAll()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      saveAll()
    }
  })
</script>

{#snippet tickRow(item: PlanItem)}
  <li class="row" class:done={ticked(item.tickKey ?? item.id)}>
    <label class="check">
      <input type="checkbox" checked={ticked(item.tickKey ?? item.id)} onchange={() => tick(item)} />
      <span class="text">
        <span class="label">{item.label}</span>
        {#if item.detail}<span class="detail">{item.detail}</span>{/if}
      </span>
    </label>
    {#if item.link}<a class="item-link" href={item.link.href}>{item.link.text}</a>{/if}
    {#if item.steps}
      <details class="steps">
        <summary>{item.stepsLabel ?? 'Show steps'}</summary>
        <ul>
          {#each item.steps as step (step)}<li>{step}</li>{/each}
        </ul>
      </details>
    {/if}
    {#if takesNote(item) && ticked(item.tickKey ?? item.id)}
      {@const key = `note:${item.id}`}
      {@const note = drafts[key] ?? storedNote(item)}
      <details class="steps note" open={!!note}>
        <summary>{note ? 'Note' : 'Add a note'}</summary>
        <textarea
          rows="2"
          aria-label="Note: {item.label}"
          placeholder={NOTE_HINTS[item.id] ?? 'Anything worth noting…'}
          value={note}
          oninput={(event) => editText(key, event.currentTarget.value, noteSaver(item))}
          onblur={() => finishText(key)}
        ></textarea>
      </details>
    {/if}
  </li>
{/snippet}

{#snippet weighInRow(item: PlanItem)}
  <li class="row">
    <div class="row-head">
      <span class="text">
        <span class="label">{item.label}</span>
        {#if item.detail}<span class="detail">{item.detail}</span>{/if}
      </span>
    </div>
    <div class="measure">
      <label>
        Weight
        <input
          type="number"
          inputmode="decimal"
          step="0.1"
          min="0"
          value={body.current.weight ?? ''}
          onchange={(event) => setMeasurement(date, 'weight', toNumber(event.currentTarget.value))}
        />
        kg
      </label>
      <label>
        Waist
        <input
          type="number"
          inputmode="decimal"
          step="0.5"
          min="0"
          value={body.current.waist ?? ''}
          onchange={(event) => setMeasurement(date, 'waist', toNumber(event.currentTarget.value))}
        />
        cm
      </label>
    </div>
  </li>
{/snippet}

{#snippet trackRow(item: PlanItem)}
  {@const session = sessionOf(item)}
  <li class="row" class:done={!!session}>
    <label class="check">
      <input type="checkbox" checked={!!session} onchange={() => tickActivity(item)} />
      <span class="text">
        <span class="label">{item.label}</span>
        {#if item.detail}<span class="detail">{item.detail}</span>{/if}
      </span>
    </label>
    {#if item.link}<a class="item-link" href={item.link.href}>{item.link.text}</a>{/if}
    {#if item.steps}
      <details class="steps">
        <summary>{item.stepsLabel ?? 'Show more'}</summary>
        <ul>
          {#each item.steps as step (step)}<li>{step}</li>{/each}
        </ul>
      </details>
    {/if}
    {#if session}
      <div class="session">
        {#if item.input === 'pages'}
          <label>
            Pages
            <input type="number" inputmode="numeric" min="0" value={session.pages ?? ''} onchange={(event) => saveDetails(item, { pages: toNumber(event.currentTarget.value) })} />
          </label>
        {:else}
          <label>
            Minutes
            <input type="number" inputmode="numeric" min="0" value={session.minutes ?? ''} onchange={(event) => saveDetails(item, { minutes: toNumber(event.currentTarget.value) })} />
          </label>
        {/if}
        <label class="grow">
          What you did
          <input type="text" value={session.practiced} onchange={(event) => saveDetails(item, { practiced: event.currentTarget.value.trim() })} />
        </label>
        <label class="grow">
          How it felt
          <input type="text" value={session.feeling} onchange={(event) => saveDetails(item, { feeling: event.currentTarget.value.trim() })} />
        </label>
      </div>
    {/if}
  </li>
{/snippet}

{#snippet itemRow(item: PlanItem)}
  {#if item.id === 'weigh-in'}
    {@render weighInRow(item)}
  {:else if item.trackId}
    {@render trackRow(item)}
  {:else}
    {@render tickRow(item)}
  {/if}
{/snippet}

<header>
  <h1>{plan.weekday}</h1>
  <p class="date">{plan.dateText}</p>
</header>

{#if !isToday}
  <p class="notice">You're looking at another day. Changes still save. <a href="#/today">Back to today</a></p>
{/if}

{#if crunchDay}
  <div class="notice crunch">
    <p>Crunch day: whatever you log still counts, and nothing counts against your targets.</p>
    {#if isToday}<button type="button" class="link" onclick={() => endCrunch(date)}>End crunch</button>{/if}
  </div>
{/if}

{#if isToday && plan.weekday === 'Sunday'}
  <p class="review-cta"><a class="button" href="#/review">Review this week</a></p>
{/if}

{#if week.current}
<div class="part-tabs" role="tablist" aria-label="Parts of the day">
  {#each PARTS as tab (tab.id)}
    <button type="button" role="tab" class="part-tab {tab.id}" aria-selected={part === tab.id} onclick={() => (chosenPart = tab.id)}>
      {tab.label}
      {#if progress[tab.id].total}<span class="part-count">{progress[tab.id].done}/{progress[tab.id].total}</span>{/if}
    </button>
  {/each}
</div>

<!-- Tapping anything here keeps this part open (a checkbox's keyboard toggle is a click too). -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div class="part part-panel {part}" role="tabpanel" aria-label={PARTS.find((candidate) => candidate.id === part)?.label} onclickcapture={keepPart}>
{#if part === 'morning'}
  {#if plan.morning.length}
    <ul class="list">
      {#each plan.morning as item (item.id)}{@render itemRow(item)}{/each}
    </ul>
  {:else}
    <p class="muted small">Nothing planned this morning.</p>
  {/if}
{:else if part === 'anytime'}
  <ul class="list">
    {#each plan.anytime as item (item.id)}{@render itemRow(item)}{/each}
    {#each shownRoutines as status (status.routine.id)}
      <li class="row" class:done={status.doneThatDay}>
        <label class="check">
          <input type="checkbox" checked={status.doneThatDay} onchange={() => setRoutineDone(status.routine.id, date, !status.doneThatDay)} />
          <span class="text">
            <span class="label">{status.routine.name}</span>
            <span class="detail">routine · {dueText(status)}</span>
          </span>
        </label>
      </li>
    {/each}
    {#each dueTasks.current as due (due.task.id)}
      <li class="row" class:done={due.task.done}>
        <label class="check">
          <input type="checkbox" checked={due.task.done} onchange={() => setTaskDone(due.task.id, !due.task.done, date)} />
          <span class="text">
            <span class="label">{due.task.title}</span>
            <span class="detail">{due.listName} · {due.task.done ? 'done' : dueLabel(due.task, date)}</span>
          </span>
        </label>
      </li>
    {/each}
    {#each todos.current as todo (todo.id)}
      <li class="row" class:done={todo.done}>
        <label class="check">
          <input type="checkbox" checked={todo.done} onchange={() => setTodoDone(todo.id, !todo.done, date)} />
          <span class="text">
            <span class="label">{todo.title}</span>
            <span class="detail">{todoDetail(todo)}</span>
          </span>
        </label>
        <details class="steps">
          <summary>Edit</summary>
          <div class="todo-options">
            <label>
              Move to
              <input
                type="date"
                value={todo.date ?? date}
                onchange={(event) => {
                  if (event.currentTarget.value) void moveTodo(todo.id, event.currentTarget.value)
                }}
              />
            </label>
            <button type="button" class="link danger" onclick={() => deleteTodo(todo.id)}>Delete</button>
          </div>
        </details>
      </li>
    {/each}
  </ul>
  {#if hiddenRoutines}
    <p class="small"><a href="#/routines">and {hiddenRoutines} more late {hiddenRoutines === 1 ? 'routine' : 'routines'} →</a></p>
  {/if}
  {#if isToday && notStarted}
    <p class="muted small">
      <a href="#/routines">{notStarted} {notStarted === 1 ? 'routine isn’t' : 'routines aren’t'} started yet. Mark when you last did them →</a>
    </p>
  {/if}
  <form class="add" onsubmit={submitTodo}>
    <input type="text" bind:value={newTodo} placeholder="Add a to-do" aria-label="New to-do" />
    <button type="submit" class="button">Add</button>
  </form>

{:else}
  {#if plan.evening.length}
    <ul class="list">
      {#each plan.evening as item (item.id)}{@render itemRow(item)}{/each}
    </ul>
  {:else}
    <p class="muted small">Nothing planned this evening.</p>
  {/if}
{/if}
</div>

{#if on.food || on.diary}
<section>
  <h2>Food</h2>
  {#if !on.food}
    <!-- Food guidelines are turned off in Settings → What you use. -->
  {:else if plan.foodRules}
    <div class="field">
      <span class="field-label" id="rules-label">How did eating go?</span>
      <div class="seg" role="group" aria-labelledby="rules-label">
        {#each EATING_CHOICES as choice (choice.value)}
          <button type="button" aria-pressed={values.current.rules === choice.value} onclick={() => choose('rules', choice.value)}>{choice.label}</button>
        {/each}
      </div>
      <details class="rules">
        <summary>See the guidelines</summary>
        <ol>
          {#each foodRules.current as rule, index (index)}<li>{rule}</li>{/each}
        </ol>
        <a class="small" href="#/setup">Change the guidelines in Setup</a>
      </details>
    </div>
  {:else}
    <p class="field muted">Free day: the food guidelines are off today.</p>
  {/if}

  {#if on.diary}
    <label class="field">
      <span class="field-label">Food diary</span>
      <textarea
        rows="2"
        placeholder="Roughly what you ate today"
        value={drafts.diary ?? storedText('diary')}
        oninput={(event) => editText('diary', event.currentTarget.value)}
        onblur={() => finishText('diary')}
      ></textarea>
    </label>
  {/if}
</section>
{/if}

{#if on.energy || tracking.current.periods}
<section>
  <h2 id="energy-label">{on.energy ? 'Energy' : 'Period'}</h2>
  <div class="check-row">
    {#if on.energy}
      <div class="seg" role="group" aria-labelledby="energy-label">
        {#each ['1', '2', '3'] as value (value)}
          <button type="button" aria-pressed={values.current.energy === value} onclick={() => choose('energy', value)}>{value}</button>
        {/each}
      </div>
    {/if}
    {#if tracking.current.periods}
      <button
        type="button"
        class="period-toggle"
        aria-pressed={values.current.period === true}
        aria-label="Period day"
        title="Period day"
        onclick={togglePeriod}><Icon name={values.current.period === true ? 'drop-fill' : 'drop'} /></button
      >
    {/if}
  </div>
  <p class="muted small hint-line">{on.energy ? '1 is low, 3 is good.' : ''}{tracking.current.periods ? ' The drop marks a period day.' : ''}</p>
</section>
{/if}

{#if on.work}
<section>
  <h2 id="work-label">Work rating</h2>
  <div class="seg" role="group" aria-labelledby="work-label">
    {#each ['–', '1', '2', '3'] as value (value)}
      <button type="button" aria-pressed={values.current.work === value} onclick={() => choose('work', value)}>{value}</button>
    {/each}
  </div>
</section>
{/if}
{/if}

<section>
  <h2>Also today</h2>
  <div class="chips">
    {#each habits.current as habit (habit.id)}
      <button type="button" class="chip" aria-pressed={ticked(habit.id)} onclick={() => toggleTick(date, habit.id)}>{habit.label}</button>
    {/each}
  </div>
</section>

{#if week.current}
<section>
  <h2>Note</h2>
  <textarea
    rows="2"
    aria-label="Note"
    placeholder="Anything about today"
    value={drafts.note ?? storedText('note')}
    oninput={(event) => editText('note', event.currentTarget.value)}
    onblur={() => finishText('note')}
  ></textarea>
</section>
{/if}

<section>
  <h2>This week</h2>
  <ul class="week">
    {#each counters as counter (counter.id)}
      <li>{counter.label} <strong>{countText(counter.count)}{counter.target !== null ? `/${counter.target}` : ''}</strong></li>
    {/each}
  </ul>
  {#if isToday && !crunchDay}
    <button type="button" class="link" onclick={() => startCrunch(date)}>Busy stretch? Start crunch days</button>
  {/if}
</section>
