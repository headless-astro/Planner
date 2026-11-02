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

  let { kind, today }: { kind: MediaKind; today: string } = $props()

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
  let newStatus = $state<'active' | 'want' | 'done'>('active')

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
    await addMedia(kind, title, newStatus, today, { author: newAuthor.trim(), format: newFormat })
    newTitle = ''
    newAuthor = ''
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
  <p class="date">Add a title when you start it, and rate it when you finish.</p>
</header>

<nav class="chips list-tabs" aria-label="Books, games, movies and shows">
  {#each KINDS as [key, value] (key)}
    <a class="chip" href="#/{value.screen}" aria-current={key === kind ? 'page' : undefined}>{value.title}</a>
  {/each}
</nav>

<section>
  <h2>Add a {info.one}</h2>
  <form class="add-row" onsubmit={submit}>
    <input class="grow" type="text" bind:value={newTitle} placeholder="Title" aria-label="New {info.one}" />
    {#if kind === 'book'}
      <input class="grow" type="text" bind:value={newAuthor} placeholder="Author (optional)" aria-label="Author" />
    {:else if kind === 'watch'}
      <select bind:value={newFormat} aria-label="Movie or show">
        <option value="movie">Movie</option>
        <option value="show">Show</option>
      </select>
    {/if}
    <select bind:value={newStatus} aria-label="Status">
      <option value="active">{info.active}</option>
      <option value="want">{info.want}</option>
      <option value="done">Finished today</option>
    </select>
    <button type="submit" class="button">Add</button>
  </form>
  {#if info.tick}
    <p class="muted small">Finishing one also ticks {info.tick === 'read' ? 'Read' : 'Movie/Show'} for the day.</p>
  {/if}
</section>

{#if groups.active.length}
  <section>
    <h2>{info.active}</h2>
    <ul class="list">
      {#each groups.active as item (item.id)}{@render itemRow(item)}{/each}
    </ul>
  </section>
{/if}

{#if groups.want.length}
  <section>
    <h2>{info.want}</h2>
    <ul class="list">
      {#each groups.want as item (item.id)}{@render itemRow(item)}{/each}
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
