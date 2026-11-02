<script lang="ts">
  import TrackCard from '../components/TrackCard.svelte'
  import { WEEKDAYS } from '../lib/dates'
  import type { Track, TrackSession } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { addTrack, listSessions, listTracks } from '../lib/tracks'

  let { today }: { today: string } = $props()

  const tracks = live(() => listTracks, [] as Track[])
  const sessions = live(() => listSessions, [] as TrackSession[])

  let newName = $state('')
  let newStart = $state('')
  let newWeeks = $state<number | null>(4)
  let newWeekdays = $state<number[]>([5])

  function toggleWeekday(day: number) {
    newWeekdays = newWeekdays.includes(day) ? newWeekdays.filter((d) => d !== day) : [...newWeekdays, day].sort()
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const name = newName.trim()
    const weeks = Math.round(Number(newWeeks))
    if (!name || !newStart || !(weeks >= 1) || newWeekdays.length === 0) return
    await addTrack(name, newStart, weeks, [...newWeekdays])
    newName = ''
    newStart = ''
  }
</script>

<header>
  <h1>Practice</h1>
  <p class="date">Short tracks with set days. Extra sessions are a bonus.</p>
</header>

{#each tracks.current as track (track.id)}
  <TrackCard {track} {today} sessions={sessions.current.filter((session) => session.trackId === track.id)} />
{/each}

<section>
  <h2>New track</h2>
  <form class="edit-panel card padded" onsubmit={submit}>
    <label>Name <input type="text" bind:value={newName} placeholder="e.g. Swimming" /></label>
    <label>Starts <input type="date" bind:value={newStart} /></label>
    <label>Weeks <input type="number" min="1" bind:value={newWeeks} /></label>
    <fieldset class="weekdays">
      <legend>Days</legend>
      {#each WEEKDAYS as name, day (name)}
        <label class="inline-check">
          <input type="checkbox" checked={newWeekdays.includes(day)} onchange={() => toggleWeekday(day)} />
          {name.slice(0, 3)}
        </label>
      {/each}
    </fieldset>
    <button type="submit" class="button">Add track</button>
  </form>
</section>
