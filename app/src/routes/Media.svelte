<script lang="ts" module>
  export type MediaView = 'log' | 'want' | 'done' | 'favorites'
</script>

<script lang="ts">
  import AddToggle from '../components/AddToggle.svelte'
  import Icon from '../components/Icon.svelte'
  import MoreNav from '../components/MoreNav.svelte'
  import { formatDate, parseDate } from '../lib/dates'
  import type { MediaItem, MediaStatus, Thumb } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import {
    SHELVES,
    addMedia,
    deleteMedia,
    finishMedia,
    finishedIn,
    groupMedia,
    isRated,
    listShelf,
    setFavorite,
    setThumb,
    sortMedia,
    startMedia,
    thumbOf,
    updateMedia,
    type MediaChanges,
    type MediaOrder,
    type Shelf,
  } from '../lib/media'
  import { checkLetterboxd, getLetterboxd, importExport, profileLink, type MergeResult } from '../lib/letterboxd'

  let { shelf, today, view = 'log' }: { shelf: Shelf; today: string; view?: MediaView } = $props()

  const RATINGS = [1, 2, 3, 4, 5]
  const THUMBS: { value: Thumb; label: string; icon: 'thumbs-up' | 'minus' | 'thumbs-down' }[] = [
    { value: 'up', label: 'Enjoyed it', icon: 'thumbs-up' },
    { value: 'meh', label: 'It was okay', icon: 'minus' },
    { value: 'down', label: "Didn't enjoy it", icon: 'thumbs-down' },
  ]
  const STATUSES: MediaStatus[] = ['active', 'want', 'done', 'stopped']
  const VIEW_PATH: Record<MediaView, string> = { log: '', want: '/want', done: '/done', favorites: '/favorites' }

  const info = $derived(SHELVES[shelf])
  const want = $derived(view === 'want')
  const items = live(() => {
    const current = shelf
    return () => listShelf(current)
  }, [] as MediaItem[])
  const groups = $derived(groupMedia(items.current))
  const year = $derived(today.slice(0, 4))
  const finishedThisYear = $derived(finishedIn(items.current, year))

  // Newest first or best first, remembered per tab on this device.
  const orderKey = $derived(`media-order:${shelf}`)
  let order = $state<MediaOrder>('date')
  $effect(() => {
    try {
      order = localStorage.getItem(orderKey) === 'rating' ? 'rating' : 'date'
    } catch {
      order = 'date'
    }
  })
  function chooseOrder(value: MediaOrder) {
    order = value
    try {
      localStorage.setItem(orderKey, value)
    } catch {
      // Not remembered, which is fine.
    }
  }
  const finished = $derived(sortMedia(groups.finished, order))
  const favorites = $derived(
    sortMedia(
      items.current.filter((item) => item.favorite),
      order,
    ),
  )

  // Finished ones move to the Finished tab; the ones you just finished here stay in view
  // until they're rated, so the "How was it?" prompt is right there.
  let justFinished = $state<string[]>([])
  const justDone = $derived(
    view === 'log' ? items.current.filter((item) => justFinished.includes(item.id) && item.status === 'done' && !isRated(item)) : [],
  )
  async function finish(item: MediaItem) {
    justFinished = [...justFinished, item.id]
    await finishMedia(item.id, today)
  }

  // The add form opens with + and adds to the sub-tab you're on (F51, F52).
  let adding = $state(false)
  const newStatus = $derived<'want' | 'active' | 'done'>(view === 'want' ? 'want' : view === 'done' ? 'done' : 'active')
  let newTitle = $state('')
  let newAuthor = $state('')
  // Empty dates mean today.
  let newStarted = $state('')
  let newFinished = $state('')
  let newRating = $state<number | null>(null)
  let newThumb = $state<Thumb | null>(null)
  let newFavorite = $state(false)

  // Letterboxd, on Movies.
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
  const about = (item: MediaItem) => [item.author, item.year, item.genre].filter(Boolean).join(' · ')
  const thumbInfo = (item: MediaItem) => THUMBS.find((thumb) => thumb.value === thumbOf(item))

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
    await addMedia(info.kind, title, newStatus, today, {
      author: newAuthor.trim(),
      format: info.format ?? undefined,
      started: newStarted || today,
      finished: newFinished || today,
      rating: info.stars ? newRating : null,
      thumb: info.stars ? null : newThumb,
      favorite: newFavorite,
    })
    newTitle = ''
    newAuthor = ''
    newStarted = ''
    newFinished = ''
    newRating = null
    newThumb = null
    newFavorite = false
    adding = false
  }
</script>

{#snippet starButtons(value: number | null, choose: (value: number | null) => void, labelId: string)}
  <div class="seg" role="group" aria-labelledby={labelId}>
    {#each RATINGS as star (star)}
      <button type="button" aria-label="{star} of 5" aria-pressed={value === star} onclick={() => choose(value === star ? null : star)}>{star}</button>
    {/each}
  </div>
{/snippet}

{#snippet thumbButtons(value: Thumb | null, choose: (value: Thumb | null) => void, labelId: string)}
  <div class="seg thumbs" role="group" aria-labelledby={labelId}>
    {#each THUMBS as thumb (thumb.value)}
      <button
        type="button"
        aria-label={thumb.label}
        title={thumb.label}
        aria-pressed={value === thumb.value}
        onclick={() => choose(value === thumb.value ? null : thumb.value)}><Icon name={thumb.icon} /></button
      >
    {/each}
  </div>
{/snippet}

{#snippet rateButtons(item: MediaItem, labelId: string)}
  {#if info.stars}
    {@render starButtons(item.rating, (rating) => updateMedia(item.id, { rating }), labelId)}
  {:else}
    {@render thumbButtons(thumbOf(item), (thumb) => setThumb(item.id, thumb), labelId)}
  {/if}
{/snippet}

{#snippet heartButton(on: boolean, toggle: () => void, label: string)}
  <button type="button" class="heart" aria-label={label} title={label} aria-pressed={on} onclick={toggle}><Icon name={on ? 'heart-fill' : 'heart'} /></button>
{/snippet}

{#snippet itemRow(item: MediaItem)}
  {@const thumb = thumbInfo(item)}
  {@const status = view === 'favorites' && item.status !== 'done' ? statusLabel(item.status) : ''}
  {@const detail = [status, when(item)].filter(Boolean).join(' · ')}
  <li class="row">
    <div class="routine-head">
      <span class="text grow">
        <span class="label">{item.title}</span>
        {#if about(item)}<span class="detail">{about(item)}</span>{/if}
        {#if detail || isRated(item)}
          <span class="detail rated">
            {detail}{#if detail && isRated(item)}&nbsp;·&nbsp;{/if}
            {#if info.stars && item.rating}
              <span aria-hidden="true">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span><span class="visually-hidden">rated {item.rating} of 5</span>
            {:else if !info.stars && thumb}
              <span class="thumb-mark"><Icon name={thumb.icon} /><span class="visually-hidden">{thumb.label}</span></span>
            {/if}
          </span>
        {/if}
      </span>
      {@render heartButton(
        !!item.favorite,
        () => setFavorite(item.id, !item.favorite),
        item.favorite ? `Remove "${item.title}" from favourites` : `Add "${item.title}" to favourites`,
      )}
      {#if item.status === 'active'}
        <button type="button" class="button small" onclick={() => finish(item)}>Finished</button>
      {:else if item.status === 'want'}
        <button type="button" class="button small secondary" onclick={() => startMedia(item.id, today)}>Start</button>
      {/if}
    </div>
    {#if item.status === 'done' && !isRated(item)}
      <div class="rate">
        <span class="small" id="rate-{item.id}">How was it?</span>
        {@render rateButtons(item, `rate-${item.id}`)}
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
        {#if info.kind === 'book'}
          <label>Author <input type="text" value={item.author} onchange={(event) => updateMedia(item.id, { author: event.currentTarget.value.trim() })} /></label>
        {:else if info.kind === 'watch'}
          <label>
            Movie or show
            <select value={item.format ?? 'movie'} onchange={(event) => updateMedia(item.id, { format: event.currentTarget.value === 'show' ? 'show' : 'movie' })}>
              <option value="movie">Movie (moves it to Movies)</option>
              <option value="show">Show (moves it to Shows)</option>
            </select>
          </label>
        {/if}
        <label>Genre <input type="text" value={item.genre} onchange={(event) => updateMedia(item.id, { genre: event.currentTarget.value.trim() })} /></label>
        <label>
          Status
          <select value={item.status} onchange={(event) => setStatus(item, event.currentTarget.value as MediaStatus)}>
            {#each STATUSES as value (value)}<option {value}>{statusLabel(value)}</option>{/each}
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
          <span class="field-label" id="rating-{item.id}">{info.stars ? 'Rating' : 'How was it?'}</span>
          {@render rateButtons(item, `rating-${item.id}`)}
        </div>
        <label>Notes <textarea rows="3" value={item.notes} onchange={(event) => updateMedia(item.id, { notes: event.currentTarget.value })}></textarea></label>
        <button type="button" class="link danger" onclick={() => window.confirm(`Delete "${item.title}"?`) && deleteMedia(item.id)}>Delete</button>
      </div>
    </details>
  </li>
{/snippet}

{#snippet orderPicker()}
  <div class="seg order" role="group" aria-label="Order">
    <button type="button" aria-pressed={order === 'date'} onclick={() => chooseOrder('date')}>Newest</button>
    <button type="button" aria-pressed={order === 'rating'} onclick={() => chooseOrder('rating')}>{info.stars ? 'Top rated' : 'Liked first'}</button>
  </div>
{/snippet}

<header class="with-add">
  <div>
    <h1>{info.title}</h1>
    <p class="date">
      {view === 'want'
        ? `What you'd like to get to. Start one and it moves to ${info.log}.`
        : view === 'done'
          ? 'Everything you finished, and the ones you stopped.'
          : view === 'favorites'
            ? 'The ones you gave a heart.'
            : 'What you’re on now.'}
    </p>
  </div>
  {#if view !== 'favorites'}
    <AddToggle bind:open={adding} label={view === 'want' ? `Add to ${info.want.toLowerCase()}` : `Add a ${info.one}`} />
  {/if}
</header>

<MoreNav current={shelf} {view} />

<nav class="subtabs media-subtabs" aria-label="{info.log}, {info.want}, {info.done} and favourites">
  <a href="#/{shelf}" aria-current={view === 'log' ? 'page' : undefined}>{info.log}</a>
  <a href="#/{shelf}/want" aria-current={view === 'want' ? 'page' : undefined}>{info.want}</a>
  <a href="#/{shelf}/done" aria-current={view === 'done' ? 'page' : undefined}>{info.done}</a>
  <a href="#/{shelf}/favorites" class="fav-tab" aria-current={view === 'favorites' ? 'page' : undefined} aria-label="Favourites" title="Favourites"
    ><Icon name={view === 'favorites' ? 'heart-fill' : 'heart'} /></a
  >
</nav>

{#if view === 'favorites'}
  <section>
    <div class="media-head">
      <h2>Favourites</h2>
      {#if favorites.length > 1}{@render orderPicker()}{/if}
    </div>
    {#if favorites.length}
      <ul class="list">
        {#each favorites as item (item.id)}{@render itemRow(item)}{/each}
      </ul>
    {:else}
      <p class="muted small">No favourites yet. Tap the heart on any {info.one} to add it here.</p>
    {/if}
  </section>
{:else}
  {#if adding}
  <section>
    <h2>{want ? `Add to ${info.want.toLowerCase()}` : view === 'done' ? `Add a ${info.one} you finished` : `Add a ${info.one}`}</h2>
    <form class="card edit-panel add-media" onsubmit={submit}>
      <div class="title-row">
        <input type="text" bind:value={newTitle} placeholder="Title" aria-label="New {info.one}" />
        {@render heartButton(newFavorite, () => (newFavorite = !newFavorite), 'Favourite')}
      </div>
      {#if info.kind === 'book'}
        <input type="text" bind:value={newAuthor} placeholder="Author (optional)" aria-label="Author" />
      {/if}
      {#if !want}
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
            <span class="field-label" id="new-rating">{info.stars ? 'Rating' : 'How was it?'}</span>
            {#if info.stars}
              {@render starButtons(newRating, (rating) => (newRating = rating), 'new-rating')}
            {:else}
              {@render thumbButtons(newThumb, (thumb) => (newThumb = thumb), 'new-rating')}
            {/if}
          </div>
        {/if}
      {/if}
      <button type="submit" class="button">Add</button>
    </form>
    {#if info.tick && !want}
      <p class="muted small">Finishing one ticks {info.tick === 'read' ? 'Read' : 'Movie/Show'} on the day you finished it, past days too.</p>
    {/if}
  </section>
  {/if}

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
  {:else if view === 'done'}
    <section>
      <div class="media-head">
        <h2>{info.done}</h2>
        {#if finished.length > 1}{@render orderPicker()}{/if}
      </div>
      {#if finished.length}
        <p class="muted small">{finishedThisYear} finished in {year}.</p>
        <ul class="list">
          {#each finished as item (item.id)}{@render itemRow(item)}{/each}
        </ul>
      {:else}
        <p class="muted small">Nothing finished yet.</p>
      {/if}
    </section>
  {:else}
    {#if justDone.length}
      <section>
        <h2>Just finished</h2>
        <ul class="list">
          {#each justDone as item (item.id)}{@render itemRow(item)}{/each}
        </ul>
      </section>
    {/if}
    <section>
      <h2>{info.active}</h2>
      {#if groups.active.length}
        <ul class="list">
          {#each groups.active as item (item.id)}{@render itemRow(item)}{/each}
        </ul>
      {:else}
        <p class="muted small">Nothing on the go. Tap + to add a {info.one}, or start one from {info.want}.</p>
      {/if}
    </section>
  {/if}
{/if}

{#if shelf === 'movies' && view === 'done'}
  <section>
    <details class="card letterboxd" open={!!letterboxdMessage}>
      <summary>Letterboxd</summary>
      {#if letterboxd.current.username}
        <p class="small">
          <a href={profileLink(letterboxd.current.username)} target="_blank" rel="noopener noreferrer">Open your Letterboxd</a>
          · <a href="{profileLink(letterboxd.current.username)}watchlist/" target="_blank" rel="noopener noreferrer">Watchlist</a>
        </p>
        <button type="button" class="button small" disabled={letterboxdBusy} onclick={() => runLetterboxd(checkLetterboxd)}>Check Letterboxd</button>
        <p class="muted small">Brings in films from your Letterboxd diary (the latest 50) with the day you watched them, your rating and your heart. Only when you tap it.</p>
      {:else}
        <p class="small">Add your Letterboxd username in <a href="#/setup">Settings → Setup</a> to link it here and check it for new films.</p>
      {/if}
      <label class="file-button">
        <span class="button small secondary">Import a Letterboxd export</span>
        <input class="visually-hidden" type="file" accept=".zip,.csv" multiple disabled={letterboxdBusy} onchange={chooseExport} />
      </label>
      <p class="muted small">
        On letterboxd.com: Settings → Import &amp; Export → Export your data, then choose the .zip here. Your diary, everything you've watched, your ratings, your hearts
        and your watchlist come in. Films already here are updated, not doubled.
      </p>
      {#if letterboxdMessage}<p class="small" role="status">{letterboxdMessage}</p>{/if}
    </details>
  </section>
{/if}
