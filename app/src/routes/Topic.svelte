<script lang="ts">
  import { formatShort, parseDate } from '../lib/dates'
  import type { Topic } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { listTopics, setTopicDone, updateTopic } from '../lib/study'

  let { number, today }: { number: number; today: string } = $props()

  const topics = live(() => listTopics, [] as Topic[])
  const topic = $derived(topics.current.find((candidate) => candidate.number === number) ?? null)

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
    if (text === undefined || !topic) return
    await updateTopic(topic.id, field === 'startNote' ? { startNote: text } : { endNote: text })
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

{#if topic}
  <header>
    <h1>#{topic.number} {topic.title}</h1>
    <p class="date">{topic.block}</p>
  </header>

  <p class="notice">{topic.subtopics}</p>

  <label class="field">
    <span class="field-label">Where I'm starting <span class="hint">2 lines, before the session</span></span>
    <textarea
      rows="2"
      value={drafts.startNote ?? topic.startNote}
      oninput={(event) => edit('startNote', event.currentTarget.value)}
      onblur={() => finish('startNote')}
    ></textarea>
  </label>

  <label class="field">
    <span class="field-label">What I understand now <span class="hint">3 lines, after</span></span>
    <textarea
      rows="3"
      value={drafts.endNote ?? topic.endNote}
      oninput={(event) => edit('endNote', event.currentTarget.value)}
      onblur={() => finish('endNote')}
    ></textarea>
  </label>

  <label class="inline-check field">
    <input type="checkbox" checked={topic.needsRevision} onchange={(event) => updateTopic(topic.id, { needsRevision: event.currentTarget.checked })} />
    Needs revision
  </label>

  <div class="actions">
    {#if topic.doneDate}
      <span class="small">Done {formatShort(parseDate(topic.doneDate))}</span>
      <button type="button" class="button secondary" onclick={() => setTopicDone(topic.id, today, false)}>Mark not done</button>
    {:else}
      <button type="button" class="button" onclick={() => setTopicDone(topic.id, today, true)}>Mark done today</button>
    {/if}
  </div>

  <nav class="pager" aria-label="Topics">
    {#if number > 1}<a href="#/study/{number - 1}">← #{number - 1}</a>{:else}<span></span>{/if}
    <a href="#/study">All topics</a>
    {#if number < topics.current.length}<a href="#/study/{number + 1}">#{number + 1} →</a>{:else}<span></span>{/if}
  </nav>
{:else if topics.current.length}
  <p class="notice">There's no topic #{number}. <a href="#/study">All topics</a></p>
{/if}
