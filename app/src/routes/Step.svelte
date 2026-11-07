<script lang="ts">
  // One step of a track (F69): what it covers, notes before and after, and the revision mark.
  // Tech study's topics are steps like any other.
  import { formatShort, parseDate } from '../lib/dates'
  import type { Topic, Track } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { listAllSteps, listTracks, stepsOf, updateStep } from '../lib/tracks'

  // Older links name a tech study topic by its number (#/study/3).
  let { id, number, today }: { id: string; number?: number; today: string } = $props()

  const allSteps = live(() => listAllSteps, [] as Topic[])
  const tracks = live(() => listTracks, [] as Track[])
  const step = $derived(
    (id ? allSteps.current.find((candidate) => candidate.id === id) : stepsOf('track-tech', allSteps.current).find((candidate) => candidate.number === number)) ?? null,
  )
  const trackId = $derived(step?.trackId ?? 'track-tech')
  const track = $derived(tracks.current.find((candidate) => candidate.id === trackId) ?? null)
  const siblings = $derived(stepsOf(trackId, allSteps.current))
  const index = $derived(siblings.findIndex((candidate) => candidate.id === step?.id))
  const previous = $derived(index > 0 ? siblings[index - 1] : null)
  const next = $derived(index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null)

  type NoteField = 'startNote' | 'endNote'

  // Notes save half a second after you stop typing; while you type, your text wins.
  let drafts = $state<Partial<Record<NoteField, string>>>({})
  const timers = new Map<NoteField, ReturnType<typeof setTimeout>>()

  function edit(field: NoteField, text: string) {
    drafts[field] = text
    clearTimeout(timers.get(field))
    timers.set(field, setTimeout(() => void save(field), 500))
  }

  async function save(field: NoteField) {
    clearTimeout(timers.get(field))
    timers.delete(field)
    const text = drafts[field]
    if (text === undefined || !step) return
    await updateStep(step.id, field === 'startNote' ? { startNote: text } : { endNote: text })
  }

  async function finish(field: NoteField) {
    await save(field)
    delete drafts[field]
  }

  $effect(() => {
    return () => {
      for (const field of Object.keys(drafts) as NoteField[]) void save(field)
    }
  })
</script>

{#if step}
  <header>
    <h1>{step.title}</h1>
    <p class="date">{[track?.name, step.block].filter(Boolean).join(' · ')}</p>
  </header>

  {#if step.subtopics}<p class="notice">{step.subtopics}</p>{/if}

  <label class="field">
    <span class="field-label">Where I'm starting <span class="hint">a couple of lines, before the session</span></span>
    <textarea
      rows="2"
      value={drafts.startNote ?? step.startNote}
      oninput={(event) => edit('startNote', event.currentTarget.value)}
      onblur={() => finish('startNote')}
    ></textarea>
  </label>

  <label class="field">
    <span class="field-label">What I understand now <span class="hint">a few lines, after</span></span>
    <textarea rows="3" value={drafts.endNote ?? step.endNote} oninput={(event) => edit('endNote', event.currentTarget.value)} onblur={() => finish('endNote')}
    ></textarea>
  </label>

  <label class="inline-check field">
    <input type="checkbox" checked={step.needsRevision} onchange={(event) => updateStep(step.id, { needsRevision: event.currentTarget.checked })} />
    Needs revision
  </label>

  <div class="actions">
    {#if step.doneDate}
      <span class="small">Done {formatShort(parseDate(step.doneDate))}</span>
      <button type="button" class="button secondary" onclick={() => updateStep(step.id, { doneDate: null })}>Mark not done</button>
    {:else}
      <button type="button" class="button" onclick={() => updateStep(step.id, { doneDate: today })}>Mark done today</button>
    {/if}
  </div>

  <nav class="pager" aria-label="Steps">
    {#if previous}<a href="#/step/{previous.id}">← Previous</a>{:else}<span></span>{/if}
    <a href="#/track/{trackId}">All steps</a>
    {#if next}<a href="#/step/{next.id}">Next →</a>{:else}<span></span>{/if}
  </nav>
{:else if allSteps.current.length}
  <p class="notice">That step isn't there any more. <a href="#/plans">Plans</a></p>
{/if}
