<script lang="ts">
  import { formatDate, parseDate } from '../lib/dates'
  import type { MediaItem, MediaKind, MediaStatus } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import {
    MEDIA_KINDS,
    addMedia,
    deleteMedia,
    finishMedia,
    finishedIn,
    groupMedia,
    listMedia,
    startMedia,
    updateMedia,
    type MediaChanges,
    type MediaKindInfo,
  } from '../lib/media'
  import { checkLetterboxd, getLetterboxd, importExport, profileLink, type MergeResult } from '../lib/letterboxd'

  let { kind, today, want = false }: { kind: MediaKind; today: string; want?: boolean } = $props()

  const KINDS = Object.entries(MEDIA_KINDS) as [MediaKind, MediaKindInfo][]
  const RATINGS = [1, 2, 3, 4, 5]
  const STATUSES: MediaStatus[] = ['active', 'want', 'done', 'stopped']

  const info = $derived(MEDIA_KINDS[kind])
  const items = live(() => {
    const current = kind
    return () => listMedia(current)
  }, [] as MediaItem[])
  const groups = $derived(groupMedia(items.current))
  const year = $derived(today.slice(0, 4))
  const finishedThisYear = $derived(finishedIn(items.current, year))

  let newTitle = $state('')
  let newAuthor = $state('')
  let newFormat = $state<'movie' | 'show'>('movie')
  let newStatus = $state<'active' | 'done'>('active')
  // Empty dates mean today.
  let newStarted = $state('')
  let newFinished = $state('')
  let newRating = $state<number | null>(null)

  // Letterboxd, on Movies & shows.
  const letterboxd = live(() => getLetterboxd, { username: '' })
  let letterboxdMessage = $state<string | null>(null)
  let letterboxdBusy = $state(false)

  const summary = (result: MergeResult) => (result.added || result.updated ? `Done: ${result.added} added, ${result.updated} updated.` : 'Done: nothing new.')

  async function runLetterboxd(task: () => Promise<MergeResult>) {
    letterboxdBusy = true
    letterboxdMessage = null
    try {
      letterboxdMessage = summary(await task())
    } catch (error) {
      letterboxdMessage = error instanceof Error ? error.message : String(error)
    } finally {
      letterboxdBusy = false
    }
  }

  function chooseExport(event: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(event.currentTarget.files ?? [])]
    event.currentTarget.value = ''
    if (files.length) void runLetterboxd(() => importExport(files))
  }

  const day = (iso: string) => formatDate(parseDate(iso))
  const statusLabel = (status: MediaStatus) => ({ active: info.active, want: info.want, done: 'Finished', stopped: 'Stopped' })[status]

  function about(item: MediaItem): string {
    const format = item.format === 'show' ? 'Show' : item.format === 'movie' ? 'Movie' : ''
    return [item.author, format, item.genre].filter(Boolean).join(' · ')
  }

  function when(item: MediaItem): string {
    if (item.status === 'active') return item.started ? `started ${day(item.started)}` : ''
    if (item.status === 'stopped') return item.finished ? `stopped ${day(item.finished)}` : 'stopped'
    if (item.status === 'done' && item.finished) {
      return item.started && item.started !== item.finished ? `${day(item.started)} → ${day(item.finished)}` : `finished ${day(item.finished)}`
    }
    return ''
  }

  /** Changing the status by hand fills in the dates that go with it, without ticking anything. */
  function setStatus(item: MediaItem, status: MediaStatus) {
    const changes: MediaChanges = { status }
    if (status === 'want') Object.assign(changes, { started: null, finished: null })
    if (status === 'active') Object.assign(changes, { started: item.started ?? today, finished: null })
    if (status === 'done' || status === 'stopped') Object.assign(changes, { started: item.started ?? today, finished: item.finished ?? today })
    return updateMedia(item.id, changes)
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    await addMedia(kind, title, want ? 'want' : newStatus, today, {
      author: newAuthor.trim(),
      format: newFormat,
      started: newStarted || today,
      finished: newFinished || today,
      rating: newRating,
    })
    newTitle = ''
    newAuthor = ''
    newStarted = ''
    newFinished = ''
    newRating = null
  }
</script>

{#snippet ratingButtons(item: MediaItem, labelId: string)}
  <div class="seg" role="group" aria-labelledby={labelId}>
    {#each RATINGS as value (value)}
      <button
        type="button"
        aria-label="{value} of 5"
        aria-pressed={item.rating === value}
        onclick={() => updateMedia(item.id, { rating: item.rating === value ? null : value })}>{value}</button
      >
    {/each}
  </div>
{/snippet}

{#snippet itemRow(item: MediaItem)}
  <li class="row">
    <div class="routine-head">
      <span class="text grow">
        <span class="label">{item.title}</span>
        {#if about(item)}<span class="detail">{about(item)}</span>{/if}
        {#if when(item) || item.rating}
          <span class="detail">
            {when(item)}{#if when(item) && item.rating}&nbsp;·&nbsp;{/if}{#if item.rating}<span aria-hidden="true"
                >{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span
              ><span class="visually-hidden">rated {item.rating} of 5</span>{/if}
          </span>
        {/if}
      </span>
      {#if item.status === 'active'}
        <button type="button" class="button small" onclick={() => finishMedia(item.id, today)}>Finished</button>
      {:else if item.status === 'want'}
        <button type="button" class="button small secondary" onclick={() => startMedia(item.id, today)}>Start</button>
      {/if}
    </div>
    {#if item.status === 'done' && item.rating === null}
      <div class="rate">
        <span class="small" id="rate-{item.id}">How was it?</span>
        {@render ratingButtons(item, `rate-${item.id}`)}
      </div>
    {/if}
    <details class="steps">
      <summary>Edit</summary>
      <div class="edit-panel">
        <label>
          Title
          <input
            type="text"
            value={item.title}
            onchange={(event) => {
              const title = event.currentTarget.value.trim()
              if (title) void updateMedia(item.id, { title })
            }}
          />
        </label>
        {#if kind === 'book'}
          <label>Author <input type="text" value={item.author} onchange={(event) => updateMedia(item.id, { author: event.currentTarget.value.trim() })} /></label>
        {:else if kind === 'watch'}
          <label>
            Movie or show
            <select value={item.format ?? 'movie'} onchange={(event) => updateMedia(item.id, { format: event.currentTarget.value === 'show' ? 'show' : 'movie' })}>
              <option value="movie">Movie</option>
              <option value="show">Show</option>
            </select>
          </label>
        {/if}
        <label>Genre <input type="text" value={item.genre} onchange={(event) => updateMedia(item.id, { genre: event.currentTarget.value.trim() })} /></label>
        <label>
          Status
          <select value={item.status} onchange={(event) => setStatus(item, event.currentTarget.value as MediaStatus)}>
            {#each STATUSES as status (status)}<option value={status}>{statusLabel(status)}</option>{/each}
          </select>
        </label>
        <label>
          Started
          <input type="date" value={item.started ?? ''} onchange={(event) => updateMedia(item.id, { started: event.currentTarget.value || null })} />
        </label>
        <label>
          Finished
          <input type="date" value={item.finished ?? ''} onchange={(event) => updateMedia(item.id, { finished: event.currentTarget.value || null })} />
        </label>
        <div class="field">
          <span class="field-label" id="rating-{item.id}">Rating</span>
          {@render ratingButtons(item, `rating-${item.id}`)}
        </div>
        <label>Notes <textarea rows="3" value={item.notes} onchange={(event) => updateMedia(item.id, { notes: event.currentTarget.value })}></textarea></label>
        <button type="button" class="link danger" onclick={() => window.confirm(`Delete "${item.title}"?`) && deleteMedia(item.id)}>Delete</button>
      </div>
    </details>
  </li>
{/snippet}

<header>
  <h1>{info.title}</h1>
  <p class="date">{want ? `What you'd like to get to. Start one and it moves to ${info.log}.` : 'What you’re on now, and everything you finished.'}</p>
</header>

<nav class="chips list-tabs" aria-label="Books, games, movies and shows">
  {#each KINDS as [key, value] (key)}
    <a class="chip" href="#/{value.screen}{want ? '/want' : ''}" aria-current={key === kind ? 'page' : undefined}>{value.title}</a>
  {/each}
</nav>

<nav class="subtabs media-subtabs" aria-label="{info.log} and {info.want}">
  <a href="#/{info.screen}" aria-current={want ? undefined : 'page'}>{info.log}</a>
  <a href="#/{info.screen}/want" aria-current={want ? 'page' : undefined}>{info.want}</a>
</nav>

<section>
  <h2>{want ? `Add to ${info.want.toLowerCase()}` : `Add a ${info.one}`}</h2>
  <form class="card edit-panel add-media" onsubmit={submit}>
    <input type="text" bind:value={newTitle} placeholder="Title" aria-label="New {info.one}" />
    {#if kind === 'book'}
      <input type="text" bind:value={newAuthor} placeholder="Author (optional)" aria-label="Author" />
    {:else if kind === 'watch'}
      <select bind:value={newFormat} aria-label="Movie or show">
        <option value="movie">Movie</option>
        <option value="show">Show</option>
      </select>
    {/if}
    {#if !want}
      <div class="seg" role="group" aria-label="Status">
        <button type="button" aria-pressed={newStatus === 'active'} onclick={() => (newStatus = 'active')}>{info.active}</button>
        <button type="button" aria-pressed={newStatus === 'done'} onclick={() => (newStatus = 'done')}>Finished</button>
      </div>
      <label>
        Started
        <input type="date" max={today} value={newStarted || today} oninput={(event) => (newStarted = event.currentTarget.value)} />
      </label>
      {#if newStatus === 'done'}
        <label>
          Finished
          <input type="date" max={today} value={newFinished || today} oninput={(event) => (newFinished = event.currentTarget.value)} />
        </label>
        <div class="field">
          <span class="field-label" id="new-rating">Rating</span>
          <div class="seg" role="group" aria-labelledby="new-rating">
            {#each RATINGS as value (value)}
              <button type="button" aria-label="{value} of 5" aria-pressed={newRating === value} onclick={() => (newRating = newRating === value ? null : value)}
                >{value}</button
              >
            {/each}
          </div>
        </div>
      {/if}
    {/if}
    <button type="submit" class="button">Add</button>
  </form>
  {#if info.tick && !want}
    <p class="muted small">Finishing one ticks {info.tick === 'read' ? 'Read' : 'Movie/Show'} on the day you finished it, past days too.</p>
  {/if}
</section>

{#if want}
  <section>
    <h2>{info.want}</h2>
    {#if groups.want.length}
      <ul class="list">
        {#each groups.want as item (item.id)}{@render itemRow(item)}{/each}
      </ul>
    {:else}
      <p class="muted small">Nothing here yet.</p>
    {/if}
  </section>
{:else}
  {#if groups.active.length}
    <section>
      <h2>{info.active}</h2>
      <ul class="list">
        {#each groups.active as item (item.id)}{@render itemRow(item)}{/each}
      </ul>
    </section>
  {/if}

  <section>
    <h2>Finished</h2>
    {#if groups.finished.length}
      <p class="muted small">{finishedThisYear} finished in {year}.</p>
      <ul class="list">
        {#each groups.finished as item (item.id)}{@render itemRow(item)}{/each}
      </ul>
    {:else}
      <p class="muted small">Nothing finished yet.</p>
    {/if}
  </section>
{/if}

{#if kind === 'watch'}
  <section>
    <h2>Letterboxd</h2>
    <div class="card letterboxd">
      {#if letterboxd.current.username}
        <p class="small">
          <a href={profileLink(letterboxd.current.username)} target="_blank" rel="noopener noreferrer">Open your Letterboxd</a>
          · <a href="{profileLink(letterboxd.current.username)}watchlist/" target="_blank" rel="noopener noreferrer">Watchlist</a>
        </p>
        <button type="button" class="button small" disabled={letterboxdBusy} onclick={() => runLetterboxd(checkLetterboxd)}>Check Letterboxd</button>
        <p class="muted small">Brings in films from your Letterboxd diary (the latest 50) with the day you watched them and your rating. Only when you tap it.</p>
      {:else}
        <p class="small">Add your Letterboxd username in <a href="#/setup">Settings → Setup</a> to link it here and check it for new films.</p>
      {/if}
      <label class="file-button">
        <span class="button small secondary">Import a Letterboxd export</span>
        <input class="visually-hidden" type="file" accept=".zip,.csv" multiple disabled={letterboxdBusy} onchange={chooseExport} />
      </label>
      <p class="muted small">
        On letterboxd.com: Settings → Import &amp; Export → Export your data, then choose the .zip here. Your diary, everything you've watched, your ratings and your
        watchlist come in. Films already here are updated, not doubled.
      </p>
      {#if letterboxdMessage}<p class="small" role="status">{letterboxdMessage}</p>{/if}
    </div>
  </section>
{/if}
