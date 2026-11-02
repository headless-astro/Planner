<script lang="ts">
  import { formatShort, parseDate, toISODate, weekStart } from '../lib/dates'
  import type { SpanishLog } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { DEFAULT_SPANISH } from '../lib/setup'
  import {
    addSpanishLog,
    bookSessionLabel,
    bookState,
    deleteSpanishLog,
    dsProgress,
    getSpanishSettings,
    listSpanishLogs,
    saveBookSession,
    setBookSession,
    updateSpanishLog,
    updateSpanishSettings,
    videoMinutes,
  } from '../lib/spanish'

  let { today }: { today: string } = $props()

  const logs = live(() => listSpanishLogs, [] as SpanishLog[])
  const settings = live(() => getSpanishSettings, DEFAULT_SPANISH)

  const monday = $derived(toISODate(weekStart(parseDate(today))))
  const ds = $derived(dsProgress(videoMinutes(logs.current)))
  const weekMinutes = $derived(videoMinutes(logs.current.filter((log) => log.date >= monday && log.date <= today)))
  const book = $derived(bookState(logs.current, settings.current))

  type Kind = SpanishLog['kind']
  const KINDS: { id: Kind; label: string }[] = [
    { id: 'video', label: 'Video' },
    { id: 'book', label: 'Book' },
    { id: 'reading', label: 'Reading' },
    { id: 'exercise', label: 'Exercises' },
  ]

  // The "log practice" form. An empty date means today; an empty unit means the next one.
  let kind = $state<Kind>('video')
  let logDate = $state('')
  let minutes = $state<number | null>(null)
  let pages = $state<number | null>(null)
  let title = $state('')
  let notes = $state('')
  let unit = $state<number | null>(null)
  let review = $state<boolean | null>(null)
  let message = $state<string | null>(null)

  const isReview = $derived(review ?? book.reviewLeft > 0)

  function describe(log: SpanishLog): string {
    if (log.kind === 'book') return `Book: ${bookSessionLabel(log)}`
    if (log.kind === 'reading') return `Reading: ${log.pages ?? '?'} pages${log.title ? ` of ${log.title}` : ''}`
    if (log.kind === 'exercise') return `Exercises${log.title ? `: ${log.title}` : ''}`
    return `Video: ${log.minutes ?? '?'} min${log.title ? ` · ${log.title}` : ''}`
  }

  const positive = (value: number | null) => (value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : null)

  function wholeOrNull(text: string): number | null {
    const value = Math.round(Number(text))
    return text.trim() && Number.isFinite(value) && value > 0 ? value : null
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const date = logDate || today
    const what = notes.trim()
    message = null
    if (kind === 'video') {
      if (!positive(minutes)) return void (message = 'Add the minutes you watched.')
      await addSpanishLog(date, 'video', { minutes: positive(minutes), title: title.trim(), notes: what })
    } else if (kind === 'reading') {
      if (!positive(pages)) return void (message = 'Add the pages you read.')
      await addSpanishLog(date, 'reading', { pages: positive(pages), title: title.trim(), notes: what })
    } else if (kind === 'exercise') {
      if (!what && !title.trim()) return void (message = 'Write what you practised.')
      await addSpanishLog(date, 'exercise', { title: title.trim(), notes: what })
    } else {
      await saveBookSession(date, { unit: isReview ? null : (positive(unit) ?? book.nextUnit), notes: what })
    }
    message = 'Logged.'
    logDate = ''
    minutes = null
    pages = null
    title = ''
    notes = ''
    unit = null
    review = null
  }

  function remove(log: SpanishLog) {
    if (!window.confirm('Delete this log?')) return
    // The day's book session also ticks the book slot on Today, so that goes too.
    if (log.kind === 'book' && log.id === `${log.date}|book`) void setBookSession(log.date, false)
    else void deleteSpanishLog(log.id)
  }
</script>

<header>
  <h1>Spanish</h1>
  <p class="date">No deadline: keep at it and the hours add up.</p>
</header>

<div class="tiles">
  <div class="tile">
    <span class="tile-label">Dreaming Spanish</span>
    <span class="tile-value">{ds.hours.toFixed(1)} h</span>
    <span class="tile-note">
      Level {ds.level}{#if ds.nextLevel !== null && ds.hoursToNext !== null} · {ds.hoursToNext.toFixed(1)} h to level {ds.nextLevel}{/if}
    </span>
  </div>
  <div class="tile">
    <span class="tile-label">This week</span>
    <span class="tile-value">{weekMinutes} min</span>
  </div>
  <div class="tile">
    <span class="tile-label">Book</span>
    <span class="tile-value">{book.reviewLeft > 0 ? `${book.reviewLeft} review ${book.reviewLeft === 1 ? 'session' : 'sessions'}` : `Unit ${book.nextUnit}`}</span>
    <span class="tile-note">{book.reviewLeft > 0 ? `then unit ${book.nextUnit}` : `${book.unitsDone} done since unit ${settings.current.startUnit}`}</span>
  </div>
</div>

<section>
  <h2>Log practice</h2>
  <div class="card padded">
    <div class="seg" role="group" aria-label="Kind of practice">
      {#each KINDS as option (option.id)}
        <button type="button" aria-pressed={kind === option.id} onclick={() => (kind = option.id)}>{option.label}</button>
      {/each}
    </div>
    <form class="edit-panel" onsubmit={submit}>
      <label>
        Date
        <input type="date" max={today} value={logDate || today} oninput={(event) => (logDate = event.currentTarget.value)} />
      </label>
      {#if kind === 'video'}
        <label>Minutes <input type="number" min="1" inputmode="numeric" bind:value={minutes} /></label>
        <label>Title <input type="text" bind:value={title} placeholder="Optional" /></label>
      {:else if kind === 'reading'}
        <label>Pages <input type="number" min="1" inputmode="numeric" bind:value={pages} /></label>
        <label>Book <input type="text" bind:value={title} placeholder="Optional" /></label>
      {:else if kind === 'exercise'}
        <label>Site or topic <input type="text" bind:value={title} placeholder="Optional" /></label>
      {:else}
        <label class="inline-check">
          <input type="checkbox" checked={isReview} onchange={(event) => (review = event.currentTarget.checked)} />
          Review session
        </label>
        {#if !isReview}
          <label>Unit <input type="number" min="1" inputmode="numeric" bind:value={unit} placeholder={String(book.nextUnit)} /></label>
        {/if}
      {/if}
      <label>
        What you did
        <textarea
          rows="3"
          bind:value={notes}
          placeholder={kind === 'book' ? 'The parts of the unit, extra exercises, the grammar point…' : 'Anything worth remembering…'}
        ></textarea>
      </label>
      <button type="submit" class="button small">Log it</button>
    </form>
    {#if message}<p class="small" role="status">{message}</p>{/if}
  </div>
  <p class="muted small">What you tick and write on Today shows here too. One book session a day: logging another one on the same day changes it.</p>
</section>

<section>
  <h2>Recent</h2>
  {#if logs.current.length}
    <ul class="list">
      {#each logs.current.slice(0, 40) as log (log.id)}
        <li class="row">
          <div class="routine-head">
            <span class="text grow">
              <span class="label"><strong>{formatShort(parseDate(log.date))}</strong> · {describe(log)}</span>
              {#if log.notes}<span class="detail pre">{log.notes}</span>{/if}
            </span>
          </div>
          <details class="steps">
            <summary>Edit</summary>
            <div class="edit-panel">
              {#if log.kind === 'video'}
                <label>
                  Minutes
                  <input type="number" min="1" value={log.minutes ?? ''} onchange={(event) => updateSpanishLog(log.id, { minutes: wholeOrNull(event.currentTarget.value) })} />
                </label>
              {:else if log.kind === 'reading'}
                <label>
                  Pages
                  <input type="number" min="1" value={log.pages ?? ''} onchange={(event) => updateSpanishLog(log.id, { pages: wholeOrNull(event.currentTarget.value) })} />
                </label>
              {:else if log.kind === 'book'}
                <label>
                  Unit (empty for a review session)
                  <input type="number" min="1" value={log.unit ?? ''} onchange={(event) => updateSpanishLog(log.id, { unit: wholeOrNull(event.currentTarget.value) })} />
                </label>
              {/if}
              {#if log.kind !== 'book'}
                <label>
                  {log.kind === 'exercise' ? 'Site or topic' : log.kind === 'reading' ? 'Book' : 'Title'}
                  <input type="text" value={log.title} onchange={(event) => updateSpanishLog(log.id, { title: event.currentTarget.value.trim() })} />
                </label>
              {/if}
              <label>
                What you did
                <textarea rows="3" value={log.notes ?? ''} onchange={(event) => updateSpanishLog(log.id, { notes: event.currentTarget.value.trim() })}></textarea>
              </label>
              <button type="button" class="link danger" onclick={() => remove(log)}>Delete this log</button>
            </div>
          </details>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">Nothing logged yet. Ticking Spanish on Today and noting what you did counts here.</p>
  {/if}
</section>

<details class="card archive">
  <summary>Book settings</summary>
  <div class="edit-panel">
    <label>
      Continue from unit
      <input
        type="number"
        min="1"
        value={settings.current.startUnit}
        onchange={(event) => {
          const unit = Math.round(Number(event.currentTarget.value))
          if (unit >= 1) void updateSpanishSettings({ startUnit: unit })
        }}
      />
    </label>
    <label>
      Review sessions first
      <input
        type="number"
        min="0"
        value={settings.current.reviewSessions}
        onchange={(event) => {
          const sessions = Math.round(Number(event.currentTarget.value))
          if (sessions >= 0) void updateSpanishSettings({ reviewSessions: sessions })
        }}
      />
    </label>
  </div>
</details>
