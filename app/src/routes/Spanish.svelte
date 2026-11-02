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

  let videoMinutesInput = $state<number | null>(null)
  let videoTitle = $state('')
  let readingPages = $state<number | null>(null)
  let readingTitle = $state('')

  function describe(log: SpanishLog): string {
    if (log.kind === 'book') return `Book: ${bookSessionLabel(log)}`
    if (log.kind === 'reading') return `Reading: ${log.pages ?? '?'} pages${log.title ? ` of ${log.title}` : ''}`
    return `Video: ${log.minutes ?? '?'} min${log.title ? ` · ${log.title}` : ''}`
  }

  async function submitVideo(event: SubmitEvent) {
    event.preventDefault()
    if (!videoMinutesInput || videoMinutesInput <= 0) return
    await addSpanishLog(today, 'video', { minutes: Math.round(videoMinutesInput), title: videoTitle.trim() })
    videoMinutesInput = null
    videoTitle = ''
  }

  async function submitReading(event: SubmitEvent) {
    event.preventDefault()
    if (!readingPages || readingPages <= 0) return
    await addSpanishLog(today, 'reading', { pages: Math.round(readingPages), title: readingTitle.trim() })
    readingPages = null
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
  <h2>Log a video</h2>
  <form class="add-row" onsubmit={submitVideo}>
    <input type="number" min="1" inputmode="numeric" bind:value={videoMinutesInput} placeholder="min" aria-label="Minutes watched" />
    <input class="grow" type="text" bind:value={videoTitle} placeholder="Title (optional)" aria-label="Video title" />
    <button type="submit" class="button">Add</button>
  </form>
  <p class="muted small">Minutes noted on Today count too.</p>
</section>

<section>
  <h2>Log reading</h2>
  <form class="add-row" onsubmit={submitReading}>
    <input type="number" min="1" inputmode="numeric" bind:value={readingPages} placeholder="pages" aria-label="Pages read" />
    <input class="grow" type="text" bind:value={readingTitle} placeholder="Book" aria-label="Book title" />
    <button type="submit" class="button">Add</button>
  </form>
</section>

<section>
  <h2>Recent</h2>
  {#if logs.current.length}
    <ul class="list">
      {#each logs.current.slice(0, 30) as log (log.id)}
        <li class="row row-line padded">
          <span class="grow"><strong>{formatShort(parseDate(log.date))}</strong> · {describe(log)}</span>
          <button type="button" class="remove" aria-label="Delete this log" onclick={() => window.confirm('Delete this log?') && deleteSpanishLog(log.id)}>×</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">Nothing logged yet. Ticking Spanish on Today and noting the minutes counts here.</p>
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
