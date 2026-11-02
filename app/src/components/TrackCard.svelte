<script lang="ts">
  import { WEEKDAYS, daysBetween, formatShort, parseDate } from '../lib/dates'
  import type { Track, TrackSession } from '../lib/db'
  import { deleteTrack, saveSession, trackEnd, updateTrack } from '../lib/tracks'

  let { track, sessions, today }: { track: Track; sessions: TrackSession[]; today: string } = $props()

  // The "log a session" form. An empty date means today.
  let sessionDate = $state('')
  let minutes = $state<number | null>(null)
  let practiced = $state('')
  let feeling = $state('')

  const end = $derived(trackEnd(track))
  const status = $derived.by(() => {
    if (today < track.start) return `Starts ${formatShort(parseDate(track.start))}`
    if (today > end) return 'Finished'
    return `Week ${Math.floor(daysBetween(parseDate(track.start), parseDate(today)) / 7) + 1} of ${track.weeks}`
  })
  const days = $derived(
    [...track.weekdays]
      .sort()
      .map((day) => `${WEEKDAYS[day]}s`)
      .join(', '),
  )

  function toggleWeekday(day: number): number[] {
    return track.weekdays.includes(day) ? track.weekdays.filter((d) => d !== day) : [...track.weekdays, day].sort()
  }

  async function logSession(event: SubmitEvent) {
    event.preventDefault()
    await saveSession(track.id, sessionDate || today, {
      minutes: minutes !== null && Number.isFinite(minutes) ? Math.round(minutes) : null,
      practiced: practiced.trim(),
      feeling: feeling.trim(),
    })
    sessionDate = ''
    minutes = null
    practiced = ''
    feeling = ''
  }
</script>

<section class="card track">
  <h2 class="track-title">{track.name}</h2>
  <p class="small">{status} · {formatShort(parseDate(track.start))} – {formatShort(parseDate(end))} · {days}</p>
  {#if track.focus.length}
    <ol class="focus">
      {#each track.focus as focus, index (index)}<li>Week {index + 1}: {focus}</li>{/each}
    </ol>
  {/if}

  <h3>{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</h3>
  {#if sessions.length}
    <ul class="plain sessions">
      {#each sessions as session (session.id)}
        <li>
          <strong>{formatShort(parseDate(session.date))}</strong>
          {#if session.minutes}· {session.minutes} min{/if}
          {#if session.practiced}· {session.practiced}{/if}
          {#if session.feeling}<span class="muted"> · {session.feeling}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  <details class="steps">
    <summary>Log a session</summary>
    <form class="edit-panel" onsubmit={logSession}>
      <label>
        Date
        <input type="date" max={today} value={sessionDate || today} oninput={(event) => (sessionDate = event.currentTarget.value)} />
      </label>
      <label>Minutes <input type="number" min="0" inputmode="numeric" bind:value={minutes} /></label>
      <label>What you practised <input type="text" bind:value={practiced} /></label>
      <label>How it felt <input type="text" bind:value={feeling} /></label>
      <button type="submit" class="button small">Save session</button>
    </form>
  </details>

  <details class="steps">
    <summary>Edit track</summary>
    <div class="edit-panel">
      <label>
        Name
        <input
          type="text"
          value={track.name}
          onchange={(event) => {
            const name = event.currentTarget.value.trim()
            if (name) void updateTrack(track.id, { name })
          }}
        />
      </label>
      <label>
        Starts
        <input
          type="date"
          value={track.start}
          onchange={(event) => {
            if (event.currentTarget.value) void updateTrack(track.id, { start: event.currentTarget.value })
          }}
        />
      </label>
      <label>
        Weeks
        <input
          type="number"
          min="1"
          value={track.weeks}
          onchange={(event) => {
            const weeks = Math.round(Number(event.currentTarget.value))
            if (weeks >= 1) void updateTrack(track.id, { weeks })
          }}
        />
      </label>
      <fieldset class="weekdays">
        <legend>Days</legend>
        {#each WEEKDAYS as name, day (name)}
          <label class="inline-check">
            <input type="checkbox" checked={track.weekdays.includes(day)} onchange={() => updateTrack(track.id, { weekdays: toggleWeekday(day) })} />
            {name.slice(0, 3)}
          </label>
        {/each}
      </fieldset>
      <label>
        Focus, one line per week
        <textarea
          rows="4"
          value={track.focus.join('\n')}
          onchange={(event) =>
            updateTrack(track.id, {
              focus: event.currentTarget.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })}
        ></textarea>
      </label>
      <button type="button" class="link danger" onclick={() => window.confirm(`Delete "${track.name}"?`) && deleteTrack(track.id)}>Delete track</button>
    </div>
  </details>
</section>
