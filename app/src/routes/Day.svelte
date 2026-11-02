<script lang="ts">
  import { countCrunchDays, endCrunch, isCrunchDay, listCrunches, startCrunch } from '../lib/crunch'
  import { addDays, formatShort, parseDate, toISODate, weekStart } from '../lib/dates'
  import type { Crunch, Dose, DrawingArea, DrawingLog, Entry, Habit, Snack, SnackDef, SpanishLog, Task, Topic, Track, TrackSession } from '../lib/db'
  import { listDrawingAreas, listDrawingLogs, setDrawingSession } from '../lib/drawing'
  import { live } from '../lib/live.svelte'
  import { TRACK_ITEM_PREFIX, buildDay, type PlanItem } from '../lib/plan'
  import {
    addSnack,
    addTodo,
    clearEntry,
    deleteTodo,
    getDayMeasurements,
    getDayValues,
    getEntriesBetween,
    getSnacks,
    getTargets,
    getTodos,
    listDoses,
    listHabits,
    listSnackDefs,
    moveTodo,
    removeSnack,
    setEntry,
    setMeasurement,
    setTodoDone,
    toggleTick,
    type DayMeasurements,
    type DayValues,
  } from '../lib/repo'
  import { dueText, getRoutineStatuses, setRoutineDone, type RoutineStatus } from '../lib/routines'
  import { DEFAULT_SPANISH, DEFAULT_TARGETS } from '../lib/setup'
  import { getSpanishSettings, listSpanishLogs, saveDayLog, setBookSession } from '../lib/spanish'
  import { listTopics, setTopicDone } from '../lib/study'
  import { dueLabel, getDueTasks, setTaskDone, type DueTask } from '../lib/tasks'
  import { trackSetup } from '../lib/trackSetup'
  import { getDaySessions, listTracks, saveSession, setSession } from '../lib/tracks'
  import { weekCounters } from '../lib/week'

  let { date, isToday = false }: { date: string; isToday?: boolean } = $props()

  /** Late routines shown on Today before the rest fold into a link. */
  const MAX_LATE_ROUTINES = 4

  const monday = $derived(toISODate(weekStart(parseDate(date))))
  const sunday = $derived(toISODate(addDays(parseDate(monday), 6)))

  // Read live from the database on this device, so the screen updates the moment anything is saved.
  const doses = live(() => listDoses, [] as Dose[])
  const habits = live(() => listHabits, [] as Habit[])
  const snackDefs = live(() => listSnackDefs, [] as SnackDef[])
  const targets = live(() => getTargets, DEFAULT_TARGETS)
  const tracks = live(() => listTracks, [] as Track[])
  const crunches = live(() => listCrunches, [] as Crunch[])
  const values = live(() => () => getDayValues(date), {} as DayValues)
  const snacks = live(() => () => getSnacks(date), [] as Snack[])
  const todos = live(() => () => getTodos(date, isToday), [] as Task[])
  const dueTasks = live(() => () => getDueTasks(date, isToday), [] as DueTask[])
  const routines = live(() => () => getRoutineStatuses(date), [] as RoutineStatus[])
  const sessions = live(() => () => getDaySessions(date), {} as Record<string, TrackSession>)
  const body = live(() => () => getDayMeasurements(date), {} as DayMeasurements)
  const weekEntries = live(() => {
    const from = monday
    const to = sunday
    return () => getEntriesBetween(from, to)
  }, [] as Entry[])

  const topics = live(() => listTopics, [] as Topic[])
  const spanishSettings = live(() => getSpanishSettings, DEFAULT_SPANISH)
  const spanishLogs = live(() => listSpanishLogs, [] as SpanishLog[])
  const drawingAreas = live<DrawingArea[] | null>(() => listDrawingAreas, null)
  const drawingLogs = live(() => listDrawingLogs, [] as DrawingLog[])
  const daySpanish = $derived(spanishLogs.current.filter((log) => log.date === date))
  const slots = $derived(
    trackSetup(date, {
      topics: topics.current,
      spanishLogs: spanishLogs.current,
      spanishSettings: spanishSettings.current,
      drawingAreas: drawingAreas.current,
      drawingLogs: drawingLogs.current,
    }),
  )
  const studyTopic = $derived(slots.topic)

  const plan = $derived(
    buildDay(parseDate(date), {
      doses: doses.current,
      tracks: tracks.current,
      studyTopic: slots.studyTopic,
      bookSession: slots.bookSession,
      drawingArea: slots.drawingArea,
    }),
  )
  const crunchDay = $derived(isCrunchDay(crunches.current, date))
  const counters = $derived(
    weekCounters(weekEntries.current, habits.current, targets.current, countCrunchDays(crunches.current, monday, sunday)),
  )
  const snackTotal = $derived(snacks.current.reduce((sum, snack) => sum + snack.kcal, 0))
  const snackBudget = $derived(targets.current.snackBudget)
  const snackPercent = $derived(Math.min(100, Math.round((snackTotal / Math.max(1, snackBudget)) * 100)))

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

  let pickingSnack = $state(false)
  let newTodo = $state('')

  const ticked = (id: string) => values.current[`tick:${id}`] === true
  const dayLog = (kind: 'video' | 'reading') => daySpanish.find((log) => log.id === `${date}|${kind}`)

  /** Most items are plain ticks; tech study, the Spanish book and drawing also log a session. */
  async function tick(item: PlanItem) {
    if (item.id === 'study' && studyTopic) await setTopicDone(studyTopic.id, date, studyTopic.doneDate !== date)
    else if (item.id === 'spanish-book') await setBookSession(date, !ticked('spanish-book'))
    else if (item.id === 'drawing-study') await setDrawingSession(date, !ticked('drawing-study'), slots.drawingAreaId)
    else await toggleTick(date, item.id)
  }

  function storedText(key: string): string {
    const value = values.current[key]
    return typeof value === 'string' ? value : ''
  }

  async function choose(key: 'rules' | 'work', value: string) {
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

  function editText(key: string, text: string) {
    drafts[key] = text
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => void saveText(key), 500))
  }

  async function saveText(key: string) {
    clearTimeout(timers.get(key))
    timers.delete(key)
    const text = drafts[key]
    if (text === undefined) return
    if (text.trim()) await setEntry(date, key, text)
    else await clearEntry(date, key)
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
  <li class="row" class:done={ticked(item.id)}>
    <label class="check">
      <input type="checkbox" checked={ticked(item.id)} onchange={() => tick(item)} />
      <span class="text">
        <span class="label">{item.label}</span>
        {#if item.detail}<span class="detail">{item.detail}</span>{/if}
      </span>
    </label>
    {#if item.link}<a class="item-link" href={item.link.href}>{item.link.text}</a>{/if}
    {#if item.input && ticked(item.id)}
      <div class="session">
        {#if item.input === 'minutes'}
          <label>
            Minutes
            <input
              type="number"
              inputmode="numeric"
              min="0"
              value={dayLog('video')?.minutes ?? ''}
              onchange={(event) => saveDayLog(date, 'video', { minutes: toNumber(event.currentTarget.value) })}
            />
          </label>
        {:else}
          <label>
            Pages
            <input
              type="number"
              inputmode="numeric"
              min="0"
              value={dayLog('reading')?.pages ?? ''}
              onchange={(event) => saveDayLog(date, 'reading', { pages: toNumber(event.currentTarget.value) })}
            />
          </label>
        {/if}
      </div>
    {/if}
    {#if item.steps}
      <details class="steps">
        <summary>{item.stepsLabel ?? 'Show steps'}</summary>
        <ul>
          {#each item.steps as step (step)}<li>{step}</li>{/each}
        </ul>
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
  {@const trackId = item.id.slice(TRACK_ITEM_PREFIX.length)}
  {@const session = sessions.current[trackId]}
  <li class="row" class:done={!!session}>
    <label class="check">
      <input type="checkbox" checked={!!session} onchange={() => setSession(trackId, date, !session)} />
      <span class="text">
        <span class="label">{item.label}</span>
        {#if item.detail}<span class="detail">{item.detail}</span>{/if}
      </span>
    </label>
    {#if session}
      <div class="session">
        <label>
          Minutes
          <input
            type="number"
            inputmode="numeric"
            min="0"
            value={session.minutes ?? ''}
            onchange={(event) => saveSession(trackId, date, { minutes: toNumber(event.currentTarget.value) })}
          />
        </label>
        <label class="grow">
          What you practised
          <input
            type="text"
            value={session.practiced}
            onchange={(event) => saveSession(trackId, date, { practiced: event.currentTarget.value.trim() })}
          />
        </label>
        <label class="grow">
          How it felt
          <input
            type="text"
            value={session.feeling}
            onchange={(event) => saveSession(trackId, date, { feeling: event.currentTarget.value.trim() })}
          />
        </label>
      </div>
    {/if}
  </li>
{/snippet}

{#snippet itemRow(item: PlanItem)}
  {#if item.id === 'weigh-in'}
    {@render weighInRow(item)}
  {:else if item.id.startsWith(TRACK_ITEM_PREFIX)}
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

<section>
  <h2>Morning</h2>
  <ul class="list">
    {#each plan.morning as item (item.id)}{@render itemRow(item)}{/each}
  </ul>
</section>

<section>
  <h2>Any time</h2>
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

  <div class="card snacks">
    <div class="snack-head">
      <span class="field-label">Snacks</span>
      <span class:over={snackTotal > snackBudget}>{snackTotal} / {snackBudget} kcal</span>
      <button type="button" class="button small" aria-expanded={pickingSnack} onclick={() => (pickingSnack = !pickingSnack)}>
        {pickingSnack ? 'Done' : 'Add snack'}
      </button>
    </div>
    <div class="bar" aria-hidden="true"><div style:width="{snackPercent}%"></div></div>
    {#if snacks.current.length}
      <ul class="eaten">
        {#each snacks.current as snack (snack.id)}
          <li>
            {snack.name} · {snack.kcal}
            <button type="button" class="remove" aria-label="Remove {snack.name}" onclick={() => removeSnack(snack.id)}>×</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if pickingSnack}
      <div class="picker">
        {#each snackDefs.current as snack (snack.id)}
          <button type="button" onclick={() => addSnack(date, snack.name, snack.kcal)}>
            {snack.name}
            <small>{snack.kcal} kcal</small>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>

<section>
  <h2>Evening</h2>
  {#if plan.evening.length}
    <ul class="list">
      {#each plan.evening as item (item.id)}{@render itemRow(item)}{/each}
    </ul>
  {/if}

  {#if plan.foodRules}
    <div class="field">
      <span class="field-label" id="rules-label">Food rules today</span>
      <div class="seg" role="group" aria-labelledby="rules-label">
        <button type="button" aria-pressed={values.current.rules === 'kept'} onclick={() => choose('rules', 'kept')}>Kept</button>
        <button type="button" aria-pressed={values.current.rules === 'slip'} onclick={() => choose('rules', 'slip')}>Slip</button>
      </div>
    </div>
  {:else}
    <p class="field muted">Free day: the food rules are off today.</p>
  {/if}

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

  <div class="field">
    <span class="field-label" id="work-label">Work today</span>
    <div class="seg" role="group" aria-labelledby="work-label">
      {#each ['–', '1', '2', '3'] as value (value)}
        <button type="button" aria-pressed={values.current.work === value} onclick={() => choose('work', value)}>{value}</button>
      {/each}
    </div>
  </div>

  <label class="field">
    <span class="field-label">Note</span>
    <textarea
      rows="2"
      value={drafts.note ?? storedText('note')}
      oninput={(event) => editText('note', event.currentTarget.value)}
      onblur={() => finishText('note')}
    ></textarea>
  </label>
</section>

<section>
  <h2>Also today</h2>
  <div class="chips">
    {#each habits.current as habit (habit.id)}
      <button type="button" class="chip" aria-pressed={ticked(habit.id)} onclick={() => toggleTick(date, habit.id)}>{habit.label}</button>
    {/each}
  </div>
</section>

<section>
  <h2>This week</h2>
  <ul class="week">
    {#each counters as counter (counter.id)}
      <li>{counter.label} <strong>{counter.count}{counter.target !== null ? `/${counter.target}` : ''}</strong></li>
    {/each}
  </ul>
  {#if isToday && !crunchDay}
    <button type="button" class="link" onclick={() => startCrunch(date)}>Busy stretch? Start crunch days</button>
  {/if}
</section>
