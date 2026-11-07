<script lang="ts">
  // One track (F69): where it is, its steps, its weekly focus, its hours, and what you did.
  // Tech study, Spanish, drawing and driving all live here, like anything you add.
  import { dayActivities, scheduledThings } from '../lib/activities'
  import { WEEKDAYS, formatShort, parseDate } from '../lib/dates'
  import type { Habit, Topic, Track, TrackSession } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { getWeek, listHabits } from '../lib/repo'
  import type { DayTemplate } from '../lib/setup'
  import {
    addSession,
    addStep,
    deleteSession,
    deleteStep,
    deleteTrack,
    focusFor,
    hoursOf,
    listAllSteps,
    listSessions,
    listTracks,
    milestoneProgress,
    stepsOf,
    trackStatus,
    updateStep,
    updateTrack,
    type TrackChanges,
  } from '../lib/tracks'

  let { id, today }: { id: string; today: string } = $props()

  const tracks = live(() => listTracks, [] as Track[])
  const allSteps = live(() => listAllSteps, [] as Topic[])
  const allSessions = live(() => listSessions, [] as TrackSession[])
  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const habits = live(() => listHabits, [] as Habit[])

  const track = $derived(tracks.current.find((candidate) => candidate.id === id) ?? null)
  const steps = $derived(stepsOf(id, allSteps.current))
  const sessions = $derived(allSessions.current.filter((session) => session.trackId === id))
  const status = $derived(track ? trackStatus(track, today) : null)
  const focus = $derived(track ? focusFor(track, sessions, today) : null)
  const nextStep = $derived(steps.find((step) => !step.doneDate) ?? null)
  const revision = $derived(steps.filter((step) => step.needsRevision))
  const blocks = $derived.by(() => {
    const groups = new Map<string, Topic[]>()
    for (const step of steps) groups.set(step.block, [...(groups.get(step.block) ?? []), step])
    return [...groups].map(([name, items]) => ({ name, items }))
  })
  const progress = $derived(track?.milestones ? milestoneProgress(hoursOf(sessions), track.milestones) : null)

  /** The days it's on, from the week (F70), each named once. */
  const days = $derived.by(() => {
    if (!week.current || !track) return []
    return week.current.flatMap((day, weekday) =>
      dayActivities(day, weekday, tracks.current).some((activity) => activity.trackId === id) ? [WEEKDAYS[weekday].slice(0, 3)] : [],
    )
  })
  const scheduled = $derived(week.current && track ? (scheduledThings(week.current, tracks.current).find((thing) => thing.trackId === id)?.weekdays.length ?? 0) : 0)

  const save = (changes: TrackChanges) => track && updateTrack(track.id, changes)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  // ── Logging a session from here ──
  let logDate = $state('')
  let logMinutes = $state<number | null>(null)
  let logPages = $state<number | null>(null)
  let logWhat = $state('')
  let logFeeling = $state('')
  let logStep = $state(false)

  async function logSession(event: SubmitEvent) {
    event.preventDefault()
    if (!track) return
    const date = logDate || today
    const step = logStep && nextStep ? nextStep : null
    await addSession(track.id, date, {
      minutes: logMinutes !== null && Number.isFinite(logMinutes) ? Math.round(logMinutes) : null,
      pages: logPages !== null && Number.isFinite(logPages) ? Math.round(logPages) : null,
      practiced: logWhat.trim(),
      feeling: logFeeling.trim(),
      ...(step ? { stepId: step.id } : {}),
      ...(focus ? { focus: focus.name } : {}),
    })
    if (step) await updateStep(step.id, { doneDate: date })
    logDate = ''
    logMinutes = null
    logPages = null
    logWhat = ''
    logFeeling = ''
    logStep = false
  }

  // ── Steps ──
  let newStep = $state('')
  let newStepBlock = $state('')

  async function submitStep(event: SubmitEvent) {
    event.preventDefault()
    const title = newStep.trim()
    if (!title) return
    await addStep(id, title, newStepBlock.trim() || (steps.at(-1)?.block ?? ''))
    newStep = ''
  }

  // ── Focus and milestones, one per line ──
  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

  function saveFocusLine(index: number, name: string) {
    if (!track) return
    const focus = [...track.focus]
    focus[index] = name
    void save({ focus: focus.filter((line, i) => line.trim() || i !== index) })
  }

  function saveFocusNotes(index: number, notes: string) {
    if (!track) return
    const focusNotes = [...(track.focusNotes ?? [])]
    while (focusNotes.length < track.focus.length) focusNotes.push('')
    focusNotes[index] = notes
    void save({ focusNotes })
  }

  function removeFocus(index: number) {
    if (!track) return
    void save({ focus: track.focus.filter((_, i) => i !== index), focusNotes: (track.focusNotes ?? []).filter((_, i) => i !== index) })
  }

  const milestoneText = (track: Track) => (track.milestones ?? []).map((milestone) => `${milestone.name}: ${milestone.hours}`).join('\n')

  function saveMilestones(text: string) {
    const milestones = lines(text).flatMap((line) => {
      const match = /^(.*?)[\s:]+(\d+(?:[.,]\d+)?)\s*h?$/.exec(line)
      return match ? [{ name: match[1].trim() || `${match[2]} h`, hours: Number(match[2].replace(',', '.')) }] : []
    })
    void save({ milestones })
  }

  function remove() {
    if (track && window.confirm(`Delete "${track.name}"? Its sessions and steps stay in your history.`)) {
      void deleteTrack(track.id)
      location.hash = '#/tracks'
    }
  }
</script>

{#if track && status}
  <header>
    <h1>{track.name}</h1>
    <p class="date">
      {status.text}{focus ? ` · this week: ${focus.name}` : ''}{days.length ? ` · ${days.join(', ')}` : ' · not on your week yet'}
    </p>
  </header>

  <div class="tiles">
    <div class="tile">
      <span class="tile-label">Sessions</span>
      <span class="tile-value">{new Set(sessions.map((session) => session.date)).size}</span>
      <span class="tile-note">{track.target ?? scheduled ? `aiming for ${track.target ?? scheduled} a week` : 'days with a session'}</span>
    </div>
    {#if track.steps}
      <div class="tile">
        <span class="tile-label">Steps done</span>
        <span class="tile-value">{steps.filter((step) => step.doneDate).length} of {steps.length}</span>
        {#if nextStep}<span class="tile-note">next: {nextStep.title}</span>{/if}
      </div>
    {/if}
    {#if progress}
      <div class="tile">
        <span class="tile-label">Time</span>
        <span class="tile-value">{progress.hours.toFixed(1)} h</span>
        <span class="tile-note">
          {[progress.reached, progress.next && progress.hoursToNext !== null ? `${progress.hoursToNext.toFixed(1)} h to ${progress.next.name}` : ''].filter(Boolean).join(' · ') ||
            'logged so far'}
        </span>
      </div>
    {/if}
  </div>
  {#if !days.length}
    <p class="small">Put it on your week on the <a href="#/week">Week screen</a>: pick it as an activity on the days you want it.</p>
  {/if}

  {#if focus && focus.notes}
    <section>
      <h2>This week: {focus.name}</h2>
      <ul class="card padded-list small">
        {#each lines(focus.notes) as line (line)}<li>{line}</li>{/each}
      </ul>
    </section>
  {/if}

  <section>
    <h2>Log a session</h2>
    <form class="edit-panel card padded" onsubmit={logSession}>
      <label>Day <input type="date" max={today} value={logDate || today} oninput={(event) => (logDate = event.currentTarget.value)} /></label>
      <div class="week-inputs">
        <label>Minutes <input type="number" min="0" bind:value={logMinutes} /></label>
        <label>Pages <input type="number" min="0" bind:value={logPages} /></label>
      </div>
      <label>What you did <input type="text" bind:value={logWhat} /></label>
      <label>How it felt <input type="text" bind:value={logFeeling} /></label>
      {#if track.steps && nextStep}
        <label class="inline-check"><input type="checkbox" bind:checked={logStep} /> It was the next step: {nextStep.title}</label>
      {/if}
      <button type="submit" class="button">Log it</button>
    </form>
  </section>

  {#if track.steps}
    {#if revision.length}
      <section>
        <h2>Needs revision</h2>
        <ul class="list links">
          {#each revision as step (step.id)}
            <li><a href="#/step/{step.id}"><span class="label">{step.title}</span></a></li>
          {/each}
        </ul>
      </section>
    {/if}
    {#each blocks as block (block.name)}
      <section>
        <h2>{block.name || 'Steps'}</h2>
        <ul class="list links">
          {#each block.items as step (step.id)}
            <li class:done={!!step.doneDate}>
              <a href="#/step/{step.id}">
                <span class="label">{step.title}</span>
                <span class="detail">
                  {[step.doneDate ? `done ${formatShort(parseDate(step.doneDate))}` : step.id === nextStep?.id ? 'next' : '', step.needsRevision ? 'needs revision' : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    <form class="add-row" onsubmit={submitStep}>
      <input class="grow" type="text" bind:value={newStep} placeholder="Add a step" aria-label="New step" />
      <input type="text" bind:value={newStepBlock} placeholder="Heading (optional)" aria-label="Step heading" />
      <button type="submit" class="button">Add</button>
    </form>
  {/if}

  <section>
    <h2>Recent sessions</h2>
    {#if sessions.length}
      <ul class="list">
        {#each sessions.slice(0, 20) as session (session.id)}
          {@const step = session.stepId ? steps.find((candidate) => candidate.id === session.stepId) : null}
          <li class="row row-line padded">
            <span class="text grow">
              <span class="label">{formatShort(parseDate(session.date))}</span>
              <span class="detail">
                {[
                  step?.title,
                  session.focus,
                  session.minutes ? `${session.minutes} min` : '',
                  session.pages ? `${session.pages} pages` : '',
                  session.practiced,
                  session.feeling,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'done'}
              </span>
            </span>
            <button type="button" class="remove" aria-label="Delete the session on {session.date}" onclick={() => window.confirm('Delete this session?') && deleteSession(session.id)}>×</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small">No sessions yet.</p>
    {/if}
  </section>

  <details class="card padded track-settings">
    <summary>Change the track</summary>
    <div class="edit-panel">
      <label>Name <input type="text" value={track.name} onchange={(event) => event.currentTarget.value.trim() && save({ name: event.currentTarget.value.trim() })} /></label>
      <label>Starts <input type="date" value={track.start} onchange={(event) => event.currentTarget.value && save({ start: event.currentTarget.value })} /></label>
      <label class="inline-check"><input type="checkbox" checked={!!track.ongoing} onchange={(event) => save({ ongoing: event.currentTarget.checked })} /> Keeps going, no end</label>
      {#if !track.ongoing}
        <label>Weeks <input type="number" min="1" value={track.weeks} onchange={(event) => Number(event.currentTarget.value) >= 1 && save({ weeks: Math.round(Number(event.currentTarget.value)) })} /></label>
      {/if}
      <label>
        Sessions a week to aim for
        <input
          type="number"
          min="0"
          value={track.target ?? ''}
          placeholder={scheduled ? `${scheduled}, the days it's on your week` : 'the days it’s on your week'}
          onchange={(event) => save({ target: event.currentTarget.value === '' ? null : Math.max(0, Math.round(Number(event.currentTarget.value))) })}
        />
      </label>
      <label>
        Each session also ticks
        <select value={track.habitId ?? ''} onchange={(event) => save({ habitId: event.currentTarget.value || null })}>
          <option value="">No habit</option>
          {#each habits.current as habit (habit.id)}<option value={habit.id}>{habit.label}</option>{/each}
        </select>
      </label>

      <label class="inline-check"><input type="checkbox" checked={!!track.steps} onchange={(event) => save({ steps: event.currentTarget.checked })} /> Steps in order</label>
      <label class="inline-check">
        <input type="checkbox" checked={!!track.milestones} onchange={(event) => save({ milestones: event.currentTarget.checked ? (track.milestones ?? []) : null })} />
        Add up time toward a goal
      </label>
      {#if track.milestones}
        <label>
          Milestones, one per line, like "Level 2: 50" (hours)
          <textarea rows="3" value={milestoneText(track)} onchange={(event) => saveMilestones(event.currentTarget.value)}></textarea>
        </label>
      {/if}

      <span class="field-label">Weekly focus</span>
      <label class="inline-check">
        <input type="checkbox" checked={!!track.loop} onchange={(event) => save({ loop: event.currentTarget.checked })} />
        Loop: move on after a week with a session, and start over after the last
      </label>
      {#each track.focus as line, index (index)}
        <div class="card padded move-edit">
          <input type="text" value={line} aria-label="Focus {index + 1}" onchange={(event) => saveFocusLine(index, event.currentTarget.value.trim())} />
          <textarea
            rows="2"
            placeholder="More about it (optional): exercises, sources…"
            aria-label="More about focus {index + 1}"
            value={track.focusNotes?.[index] ?? ''}
            onchange={(event) => saveFocusNotes(index, event.currentTarget.value)}
          ></textarea>
          <button type="button" class="link danger" onclick={() => removeFocus(index)}>Remove</button>
        </div>
      {/each}
      <button type="button" class="button secondary small" onclick={() => save({ focus: [...track.focus, `Week ${track.focus.length + 1}`] })}>Add a focus</button>

      <button type="button" class="link danger" onclick={remove}>Delete the track</button>
    </div>
  </details>

  {#if track.steps && steps.length}
    <details class="card padded track-settings">
      <summary>Change or remove steps</summary>
      <ul class="plain edit-list">
        {#each steps as step (step.id)}
          <li>
            <input class="grow" type="text" value={step.title} aria-label="Step" onchange={(event) => event.currentTarget.value.trim() && updateStep(step.id, { title: event.currentTarget.value.trim() })} />
            <button type="button" class="remove" aria-label="Delete {step.title}" onclick={() => window.confirm(`Delete "${step.title}"?`) && deleteStep(step.id)}>×</button>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{:else if tracks.current.length}
  <p class="notice">That track isn't there any more. <a href="#/tracks">All tracks</a></p>
{/if}
