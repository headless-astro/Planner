<script lang="ts">
  // The weekly review (F54): what you said last week, what went well, habits as % of their
  // targets, the week in numbers, three short notes, late tasks to clear, a look at next week,
  // and "Done reviewing".
  import HabitStrip from '../components/HabitStrip.svelte'
  import { addDays, formatShort, parseDate, toISODate, weekStart } from '../lib/dates'
  import type { Task, TaskList } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { clearEntry, setEntry } from '../lib/repo'
  import { REVIEW_NOTES, getWeekReview, type WeekReview } from '../lib/review'
  import { addTask, deleteTask, listAllTasks, listLists, setTaskDone, updateTask } from '../lib/tasks'
  import { getUpcoming, type Upcoming } from '../lib/upcoming'

  let { monday, today }: { monday: string; today: string } = $props()

  const review = live(() => {
    const week = monday
    const day = today
    return () => getWeekReview(week, day)
  }, null as WeekReview | null)
  const lists = live(() => listLists, [] as TaskList[])
  const tasks = live(() => listAllTasks, [] as Task[])

  const previous = $derived(toISODate(addDays(parseDate(monday), -7)))
  const next = $derived(toISODate(addDays(parseDate(monday), 7)))
  const isThisWeek = $derived(monday === toISODate(weekStart(parseDate(today))))

  // Next week, from Upcoming (shown when reviewing this week).
  const nextWeek = live(() => {
    const start = next
    const day = today
    return () => getUpcoming(day, start, 7)
  }, null as Upcoming | null)

  /** List tasks past their deadline, to clear: done, moved, or dropped. */
  const lateTasks = $derived(tasks.current.filter((task) => !task.done && task.listId !== null && task.due !== null && task.due < today))
  const listName = (id: string | null) => lists.current.find((list) => list.id === id)?.name ?? ''

  // Notes save half a second after you stop typing; while you type, your text wins.
  let drafts = $state<Record<string, string>>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function editNote(key: string, text: string) {
    drafts[key] = text
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => void saveNote(key), 500))
  }

  async function saveNote(key: string) {
    clearTimeout(timers.get(key))
    const text = drafts[key]
    if (text === undefined) return
    if (text.trim()) await setEntry(monday, key, text)
    else await clearEntry(monday, key)
  }

  async function finishNote(key: string) {
    await saveNote(key)
    delete drafts[key]
  }

  $effect(() => {
    return () => {
      for (const key of Object.keys(drafts)) void saveNote(key)
    }
  })

  async function toggleReviewed(done: boolean) {
    if (done) await setEntry(monday, 'reviewed', true)
    else await clearEntry(monday, 'reviewed')
  }

  async function dropTask(task: Task) {
    if (window.confirm(`Drop "${task.title}"? It's deleted from ${listName(task.listId)}.`)) await deleteTask(task.id)
  }

  // One next step per list, straight into it (optional).
  let actionList = $state('')
  let actionTitle = $state('')
  let added = $state<string[]>([])

  async function submitAction(event: SubmitEvent) {
    event.preventDefault()
    const list = lists.current.find((candidate) => candidate.id === actionList) ?? lists.current[0]
    const title = actionTitle.trim()
    if (!list || !title) return
    await addTask(list.id, title)
    added = [...added, `${title} → ${list.name}`]
    actionTitle = ''
  }

  const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`
</script>

{#snippet tile(label: string, value: string, note: string = '')}
  <div class="tile">
    <span class="tile-label">{label}</span>
    <span class="tile-value">{value}</span>
    {#if note}<span class="tile-note">{note}</span>{/if}
  </div>
{/snippet}

<header>
  <h1>Weekly review</h1>
  <p class="date">Week of {formatShort(parseDate(monday))}</p>
</header>

<nav class="pager" aria-label="Weeks">
  <a href="#/review/{previous}">← Previous week</a>
  {#if isThisWeek}<span></span><span></span>{:else}<a href="#/review">This week</a><a href="#/review/{next}">Next week →</a>{/if}
</nav>

{#if review.current}
  {@const week = review.current}
  {#if week.crunchDays}
    <p class="notice">{week.crunchDays} crunch {week.crunchDays === 1 ? 'day' : 'days'} this week. They're left out of the targets.</p>
  {/if}

  {#if week.lastWeekNext}
    <section>
      <h2>Last week you said</h2>
      <p class="card padded last-said">{week.lastWeekNext}</p>
    </section>
  {/if}

  <section>
    <h2>Went well</h2>
    {#if week.wentWell.length}
      <ul class="card plain insight-list wins">
        {#each week.wentWell as line (line)}<li>{line}</li>{/each}
      </ul>
    {:else}
      <p class="muted small">Nothing logged this week yet.</p>
    {/if}
  </section>

  <section>
    <h2>Habits</h2>
    <ul class="card plain habit-list">
      {#each week.habits as row (row.id)}<HabitStrip {row} mode="week" />{/each}
    </ul>
    <p class="muted small">This week against its target, with the 3 weeks before it.</p>
  </section>

  <section>
    <h2>The week in numbers</h2>
    <div class="tiles">
      {#if week.features.exercise}{@render tile('Workouts', `${week.workouts.done} of ${week.workouts.planned}`)}{/if}
      {#if week.meds.of}{@render tile('Meds', `${percent(week.meds.done, week.meds.of)}%`, `${week.meds.done} of ${week.meds.of} doses`)}{/if}
      {#if week.features.energy}{@render tile('Energy', week.energyAverage === null ? '–' : week.energyAverage.toFixed(1), 'average, out of 3')}{/if}
      {#if week.features.work}{@render tile('Work', week.workAverage === null ? '–' : week.workAverage.toFixed(1), 'average, out of 3')}{/if}
      {#each week.tracks as track (track.id)}
        {@render tile(track.name, `${track.days} ${track.days === 1 ? 'day' : 'days'}`, [track.steps ? `${track.steps} ${track.steps === 1 ? 'step' : 'steps'}` : '', track.minutes ? `${track.minutes} min` : ''].filter(Boolean).join(' · '))}
      {/each}
      {@render tile('Routines done', String(week.routinesDone))}
      {@render tile('Tasks done', String(week.tasksDone))}
      {#if week.features.body}
      {@render tile(
        'Weigh-in',
        week.weighIns.length ? `${week.weighIns[week.weighIns.length - 1].value} kg` : '–',
        week.weightChange === null ? '' : `${signed(week.weightChange)} kg since the last one`,
      )}
      {/if}
      {#if week.periodDays !== null}{@render tile('Period days', String(week.periodDays))}{/if}
    </div>
  </section>

  <section>
    <h2>Notes</h2>
    {#each REVIEW_NOTES as note (note.key)}
      <label class="field">
        <span class="field-label">{note.label}</span>
        <textarea
          rows="2"
          value={drafts[note.key] ?? week.notes[note.key]}
          oninput={(event) => editNote(note.key, event.currentTarget.value)}
          onblur={() => finishNote(note.key)}
        ></textarea>
      </label>
    {/each}
    {#if week.oldNotes || drafts.review !== undefined}
      <label class="field">
        <span class="field-label">Earlier notes</span>
        <textarea
          rows="3"
          value={drafts.review ?? week.oldNotes}
          oninput={(event) => editNote('review', event.currentTarget.value)}
          onblur={() => finishNote('review')}
        ></textarea>
      </label>
    {/if}
    <p class="muted small">All optional. "One thing for next week" shows at the top of next week's review.</p>
  </section>

  {#if lateTasks.length}
    <section>
      <h2>Late tasks</h2>
      <ul class="list">
        {#each lateTasks as task (task.id)}
          <li class="row late-task">
            <span class="text">
              <span class="label">{task.title}</span>
              <span class="detail">{listName(task.listId)} · was due {formatShort(parseDate(task.due ?? today))}</span>
            </span>
            <div class="late-actions">
              <button type="button" class="button small" onclick={() => setTaskDone(task.id, true, today)}>Done</button>
              <input
                type="date"
                min={today}
                aria-label="Move {task.title} to"
                onchange={(event) => {
                  if (event.currentTarget.value) void updateTask(task.id, { due: event.currentTarget.value })
                }}
              />
              <button type="button" class="link danger" onclick={() => dropTask(task)}>Drop</button>
            </div>
          </li>
        {/each}
      </ul>
      <p class="muted small">Mark it done, pick a new date, or drop it.</p>
    </section>
  {/if}

  {#if isThisWeek && nextWeek.current}
    {@const days = nextWeek.current.days.filter((day) => day.items.length)}
    <section>
      <h2>Next week</h2>
      {#if days.length}
        <ul class="card plain insight-list next-week">
          {#each days as day (day.date)}
            <li>
              <span class="plan-day">{formatShort(parseDate(day.date))}</span>
              <span class="small">{day.items.map((item) => item.title).join(' · ')}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted small">Nothing planned yet.</p>
      {/if}
    </section>
  {/if}

  <section>
    <h2>Next steps</h2>
    <p class="muted small">Add one next step per list, if it helps. Each goes straight into its list.</p>
    <form class="add-row" onsubmit={submitAction}>
      <select value={actionList || lists.current[0]?.id} onchange={(event) => (actionList = event.currentTarget.value)} aria-label="List">
        {#each lists.current as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
      </select>
      <input class="grow" type="text" bind:value={actionTitle} placeholder="Next step" aria-label="Next step" />
      <button type="submit" class="button">Add</button>
    </form>
    {#if added.length}
      <ul class="plain small">
        {#each added as item, index (index)}<li>Added: {item}</li>{/each}
      </ul>
    {/if}
  </section>

  <section class="review-done">
    {#if week.reviewed}
      <p class="small">Reviewed ✓ <button type="button" class="link" onclick={() => toggleReviewed(false)}>Undo</button></p>
    {:else}
      <button type="button" class="button full" onclick={() => toggleReviewed(true)}>Done reviewing</button>
    {/if}
  </section>
{/if}
