<script lang="ts">
  import { addDays, formatShort, parseDate, toISODate } from '../lib/dates'
  import type { DrawingArea, DrawingLog } from '../lib/db'
  import {
    addDrawingArea,
    deleteDrawingArea,
    deleteDrawingLog,
    drawingAreaFor,
    listDrawingAreas,
    listDrawingLogs,
    moveDrawingArea,
    saveDrawingLog,
    updateDrawingArea,
    type DrawingLogChanges,
  } from '../lib/drawing'
  import { linkParts } from '../lib/links'
  import { textLines } from '../lib/text'
  import { live } from '../lib/live.svelte'

  let { today }: { today: string } = $props()

  const areas = live(() => listDrawingAreas, [] as DrawingArea[])
  const logs = live(() => listDrawingLogs, [] as DrawingLog[])

  const thisWeek = $derived(drawingAreaFor(areas.current, logs.current, today))
  const fourWeeksAgo = $derived(toISODate(addDays(parseDate(today), -27)))
  const recent = $derived(logs.current.filter((log) => log.date >= fourWeeksAgo && log.date <= today).length)
  const areaName = (id: string) => areas.current.find((area) => area.id === id)?.name ?? 'No area'

  // The "log a session" form. Empty fields mean today and this week's area.
  let sessionDate = $state('')
  let sessionArea = $state('')
  let exercise = $state('')
  let minutes = $state<number | null>(null)
  let note = $state('')
  let newArea = $state('')

  const formArea = $derived(areas.current.find((area) => area.id === (sessionArea || thisWeek?.id)) ?? null)

  function wholeMinutes(value: unknown): number | null {
    const number = Math.round(Number(value))
    return value !== null && value !== '' && Number.isFinite(number) && number > 0 ? number : null
  }

  function summary(log: DrawingLog): string {
    return [log.exercise, log.minutes ? `${log.minutes} min` : '', log.note].filter(Boolean).join(' · ')
  }

  async function logSession(event: SubmitEvent) {
    event.preventDefault()
    // Only what's filled in is saved, so this adds to a session already ticked on Today.
    const changes: DrawingLogChanges = { areaId: formArea?.id ?? '' }
    if (exercise.trim()) changes.exercise = exercise.trim()
    if (wholeMinutes(minutes) !== null) changes.minutes = wholeMinutes(minutes)
    if (note.trim()) changes.note = note.trim()
    await saveDrawingLog(sessionDate || today, changes)
    sessionDate = ''
    sessionArea = ''
    exercise = ''
    minutes = null
    note = ''
  }

  async function submitArea(event: SubmitEvent) {
    event.preventDefault()
    const name = newArea.trim()
    if (!name) return
    await addDrawingArea(name)
    newArea = ''
  }
</script>

{#snippet lines(items: readonly string[], label: string)}
  {#if items.length}
    <p class="mini-label">{label}</p>
    <ul class="focus">
      {#each items as line, index (index)}
        <li>
          {#each linkParts(line) as part, partIndex (partIndex)}
            {#if part.href}<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>{:else}{part.text}{/if}
          {/each}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<header>
  <h1>Drawing</h1>
  <p class="date">Friday mornings, one area a week. The aim: at least once a week.</p>
</header>

<div class="tiles">
  <div class="tile">
    <span class="tile-label">This week</span>
    <span class="tile-value">{thisWeek?.name ?? '–'}</span>
  </div>
  <div class="tile">
    <span class="tile-label">Last 4 weeks</span>
    <span class="tile-value">{recent} {recent === 1 ? 'session' : 'sessions'}</span>
    <span class="tile-note">{logs.current.length} in all</span>
  </div>
</div>

{#if thisWeek}
  <section class="card track">
    <h2 class="track-title">This week: {thisWeek.name}</h2>
    {@render lines(thisWeek.exercises, 'Exercises')}
    {@render lines(thisWeek.sources, 'Sources')}
    {#if !thisWeek.exercises.length && !thisWeek.sources.length}
      <p class="muted small">No exercises or sources yet. Add them under Areas.</p>
    {/if}
    <p class="muted small">Ticking Friday's drawing slot on Today logs the session. The area moves on after a week you drew in, so a missed week never skips one.</p>
  </section>
{:else}
  <p class="notice">There are no areas yet. Add one below.</p>
{/if}

<details class="card archive">
  <summary>Log a session</summary>
  <form class="edit-panel" onsubmit={logSession}>
    <label>
      Date
      <input type="date" max={today} value={sessionDate || today} oninput={(event) => (sessionDate = event.currentTarget.value)} />
    </label>
    <label>
      Area
      <select value={formArea?.id ?? ''} onchange={(event) => (sessionArea = event.currentTarget.value)}>
        {#each areas.current as area (area.id)}<option value={area.id}>{area.name}</option>{/each}
      </select>
    </label>
    <label>Exercise <input type="text" list="drawing-exercises" bind:value={exercise} /></label>
    <label>Minutes <input type="number" min="0" inputmode="numeric" bind:value={minutes} /></label>
    <label>Note <input type="text" bind:value={note} /></label>
    <button type="submit" class="button small">Save session</button>
  </form>
  <datalist id="drawing-exercises">
    {#each formArea?.exercises ?? [] as line, index (index)}<option value={line}></option>{/each}
  </datalist>
</details>

<section>
  <h2>Sessions</h2>
  {#if logs.current.length}
    <ul class="list">
      {#each logs.current as log (log.id)}
        <li class="row">
          <div class="routine-head">
            <span class="text grow">
              <span class="label">{formatShort(parseDate(log.date))} · {areaName(log.areaId)}</span>
              {#if summary(log)}<span class="detail">{summary(log)}</span>{/if}
            </span>
          </div>
          <details class="steps">
            <summary>Edit</summary>
            <div class="edit-panel">
              <label>
                Area
                <select value={log.areaId} onchange={(event) => saveDrawingLog(log.date, { areaId: event.currentTarget.value })}>
                  {#each areas.current as area (area.id)}<option value={area.id}>{area.name}</option>{/each}
                  <option value="">No area</option>
                </select>
              </label>
              <label>
                Exercise
                <input type="text" value={log.exercise} onchange={(event) => saveDrawingLog(log.date, { exercise: event.currentTarget.value.trim() })} />
              </label>
              <label>
                Minutes
                <input
                  type="number"
                  min="0"
                  inputmode="numeric"
                  value={log.minutes ?? ''}
                  onchange={(event) => saveDrawingLog(log.date, { minutes: wholeMinutes(event.currentTarget.value) })}
                />
              </label>
              <label>
                Note
                <textarea rows="2" value={log.note} onchange={(event) => saveDrawingLog(log.date, { note: event.currentTarget.value.trim() })}></textarea>
              </label>
              <button type="button" class="link danger" onclick={() => window.confirm('Delete this session?') && deleteDrawingLog(log.date)}>
                Delete session
              </button>
            </div>
          </details>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">No sessions yet.</p>
  {/if}
</section>

<section>
  <h2>Areas</h2>
  <p class="muted small">One a week, in this order. The exercises and sources started as suggestions: change them freely.</p>
  <ul class="list">
    {#each areas.current as area, index (area.id)}
      <li class="row">
        <div class="routine-head">
          <span class="text grow">
            <span class="label">{area.name}{#if area.id === thisWeek?.id}&nbsp;<span class="badge">This week</span>{/if}</span>
            <span class="detail">
              {area.exercises.length} {area.exercises.length === 1 ? 'exercise' : 'exercises'} · {area.sources.length}
              {area.sources.length === 1 ? 'source' : 'sources'}
            </span>
          </span>
        </div>
        <details class="steps">
          <summary>Edit area</summary>
          <div class="edit-panel">
            <label>
              Name
              <input
                type="text"
                value={area.name}
                onchange={(event) => {
                  const name = event.currentTarget.value.trim()
                  if (name) void updateDrawingArea(area.id, { name })
                }}
              />
            </label>
            <label>
              Exercises, one per line
              <textarea
                rows="4"
                value={area.exercises.join('\n')}
                onchange={(event) => updateDrawingArea(area.id, { exercises: textLines(event.currentTarget.value) })}
              ></textarea>
            </label>
            <label>
              Sources, one per line (links open)
              <textarea
                rows="3"
                value={area.sources.join('\n')}
                onchange={(event) => updateDrawingArea(area.id, { sources: textLines(event.currentTarget.value) })}
              ></textarea>
            </label>
            <div class="actions">
              <button type="button" class="icon-button" aria-label="Move {area.name} up" disabled={index === 0} onclick={() => moveDrawingArea(area.id, -1)}>↑</button>
              <button
                type="button"
                class="icon-button"
                aria-label="Move {area.name} down"
                disabled={index === areas.current.length - 1}
                onclick={() => moveDrawingArea(area.id, 1)}>↓</button
              >
              <button type="button" class="link danger" onclick={() => window.confirm(`Delete "${area.name}"?`) && deleteDrawingArea(area.id)}>Delete area</button>
            </div>
          </div>
        </details>
      </li>
    {/each}
  </ul>
  <form class="add-row" onsubmit={submitArea}>
    <input class="grow" type="text" bind:value={newArea} placeholder="Name" aria-label="New area" />
    <button type="submit" class="button">Add area</button>
  </form>
</section>
