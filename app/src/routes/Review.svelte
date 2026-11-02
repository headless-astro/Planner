<script lang="ts">
  import { addDays, formatShort, parseDate, toISODate, weekStart } from '../lib/dates'
  import type { TaskList } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { clearEntry, setEntry } from '../lib/repo'
  import { getWeekReview, type WeekReview } from '../lib/review'
  import { addTask, listLists } from '../lib/tasks'

  let { monday, today }: { monday: string; today: string } = $props()

  const review = live(() => {
    const week = monday
    return () => getWeekReview(week)
  }, null as WeekReview | null)
  const lists = live(() => listLists, [] as TaskList[])

  const previous = $derived(toISODate(addDays(parseDate(monday), -7)))
  const next = $derived(toISODate(addDays(parseDate(monday), 7)))
  const isThisWeek = $derived(monday === toISODate(weekStart(parseDate(today))))

  // Notes save half a second after you stop typing; while you type, your text wins.
  let draft = $state<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function editNotes(text: string) {
    draft = text
    clearTimeout(timer)
    timer = setTimeout(() => void saveNotes(), 500)
  }

  async function saveNotes() {
    clearTimeout(timer)
    if (draft === null) return
    if (draft.trim()) await setEntry(monday, 'review', draft)
    else await clearEntry(monday, 'review')
  }

  async function finishNotes() {
    await saveNotes()
    draft = null
  }

  $effect(() => {
    return () => void saveNotes()
  })

  // Rule 6: at most one next action per project, straight into its list.
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
</script>

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

  <section>
    <h2>Habits</h2>
    <ul class="week">
      {#each week.counters as counter (counter.id)}
        <li>{counter.label} <strong>{counter.count}{counter.target !== null ? `/${counter.target}` : ''}</strong></li>
      {/each}
    </ul>
  </section>

  <section>
    <h2>The week in numbers</h2>
    <div class="tiles">
      <div class="tile"><span class="tile-label">Study sessions</span><span class="tile-value">{week.studySessions}</span></div>
      <div class="tile"><span class="tile-label">Spanish videos</span><span class="tile-value">{week.spanishMinutes} min</span></div>
      <div class="tile"><span class="tile-label">Routines done</span><span class="tile-value">{week.routinesDone}</span></div>
      <div class="tile"><span class="tile-label">Tasks done</span><span class="tile-value">{week.tasksDone}</span></div>
      <div class="tile">
        <span class="tile-label">Work</span>
        <span class="tile-value">{week.workAverage === null ? '–' : week.workAverage.toFixed(1)}</span>
        <span class="tile-note">average, out of 3</span>
      </div>
      <div class="tile">
        <span class="tile-label">Weigh-in</span>
        <span class="tile-value">{week.weighIns.length ? `${week.weighIns[week.weighIns.length - 1].value} kg` : '–'}</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Notes</h2>
    <textarea
      rows="4"
      placeholder="What went well, and what to change next week"
      aria-label="Review notes"
      value={draft ?? week.notes}
      oninput={(event) => editNotes(event.currentTarget.value)}
      onblur={finishNotes}
    ></textarea>
  </section>

  <section>
    <h2>Next actions</h2>
    <p class="muted small">At most one per project (rule 6). Each goes straight into its list.</p>
    <form class="add-row" onsubmit={submitAction}>
      <select bind:value={actionList} aria-label="List">
        {#each lists.current as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
      </select>
      <input class="grow" type="text" bind:value={actionTitle} placeholder="Next action" aria-label="Next action" />
      <button type="submit" class="button">Add</button>
    </form>
    {#if added.length}
      <ul class="plain small">
        {#each added as item, index (index)}<li>Added: {item}</li>{/each}
      </ul>
    {/if}
  </section>
{/if}
