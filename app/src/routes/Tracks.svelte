<script lang="ts">
  // All your tracks (F69), with a + to add one. A track's days are set on the Week screen.
  import AddToggle from '../components/AddToggle.svelte'
  import type { Track, TrackSession } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { addTrack, listSessions, listTracks, trackStatus } from '../lib/tracks'

  // "+ Add practice" on Plans opens this page with the form ready (F48).
  let { today, adding = false }: { today: string; adding?: boolean } = $props()

  const tracks = live(() => listTracks, [] as Track[])
  const sessions = live(() => listSessions, [] as TrackSession[])

  // svelte-ignore state_referenced_locally
  let showForm = $state(adding)
  let newName = $state('')
  let newStart = $state('')
  let ongoing = $state(true)
  let newWeeks = $state<number | null>(4)
  let withSteps = $state(false)
  let withTime = $state(false)
  let loop = $state(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const name = newName.trim()
    const weeks = Math.round(Number(newWeeks))
    if (!name || (!ongoing && !(weeks >= 1))) return
    const id = await addTrack({
      name,
      start: newStart || today,
      weeks: ongoing ? 0 : weeks,
      ongoing,
      steps: withSteps,
      milestones: withTime ? [] : null,
      loop,
    })
    newName = ''
    newStart = ''
    showForm = false
    location.hash = `#/track/${id}`
  }

  const count = (id: string) => new Set(sessions.current.filter((session) => session.trackId === id).map((session) => session.date)).size
</script>

<header class="with-add">
  <div>
    <h1>Tracks</h1>
    <p class="date">Anything you work at: a course, a language, a practice. Put each one on your week on the Week screen.</p>
  </div>
  <AddToggle bind:open={showForm} label="Add a track" />
</header>

{#if showForm}
  <section>
    <h2>New track</h2>
    <form class="edit-panel card padded" onsubmit={submit}>
      <!-- svelte-ignore a11y_autofocus -->
      <label>Name <input type="text" bind:value={newName} placeholder="e.g. Guitar" autofocus={adding} /></label>
      <label>Starts <input type="date" value={newStart || today} oninput={(event) => (newStart = event.currentTarget.value)} /></label>
      <label class="inline-check"><input type="checkbox" bind:checked={ongoing} /> Keeps going, no end</label>
      {#if !ongoing}
        <label>Weeks <input type="number" min="1" bind:value={newWeeks} /></label>
      {/if}
      <label class="inline-check"><input type="checkbox" bind:checked={withSteps} /> Steps in order (like topics or units)</label>
      <label class="inline-check"><input type="checkbox" bind:checked={withTime} /> Add up time toward a goal (hours, with milestones)</label>
      <label class="inline-check"><input type="checkbox" bind:checked={loop} /> A weekly focus that loops (like drawing areas)</label>
      <button type="submit" class="button">Add track</button>
      <p class="muted small">You can change all of this on the track's page.</p>
    </form>
  </section>
{/if}

{#each tracks.current as track (track.id)}
  {@const status = trackStatus(track, today)}
  <a class="card plan-card track-link" href="#/track/{track.id}">
    <span class="plan-title"><span class="grow">{track.name}</span><span class="chevron" aria-hidden="true">›</span></span>
    <span class="small muted">{status.text} · {count(track.id)} {count(track.id) === 1 ? 'session' : 'sessions'}</span>
  </a>
{:else}
  {#if !showForm}<p class="muted small">No tracks yet. Tap + to add one.</p>{/if}
{/each}
