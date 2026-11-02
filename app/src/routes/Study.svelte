<script lang="ts">
  import { formatShort, parseDate } from '../lib/dates'
  import type { Topic } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { STUDY_SESSIONS_PER_WEEK } from '../lib/setup'
  import { listTopics, studyProgress } from '../lib/study'

  let { today }: { today: string } = $props()

  const topics = live(() => listTopics, [] as Topic[])
  const progress = $derived(studyProgress(topics.current, today))
  const next = $derived(topics.current.find((topic) => !topic.doneDate) ?? null)
  const revision = $derived(topics.current.filter((topic) => topic.needsRevision))
  const blocks = $derived.by(() => {
    const byBlock = new Map<string, Topic[]>()
    for (const topic of topics.current) byBlock.set(topic.block, [...(byBlock.get(topic.block) ?? []), topic])
    return [...byBlock].map(([name, items]) => ({ name, items }))
  })

  function status(topic: Topic): string {
    const parts = []
    if (topic.doneDate) parts.push(`done ${formatShort(parseDate(topic.doneDate))}`)
    else if (topic.id === next?.id) parts.push('next')
    if (topic.needsRevision) parts.push('needs revision')
    return parts.join(' · ')
  }
</script>

<header>
  <h1>Tech study</h1>
  <p class="date">{STUDY_SESSIONS_PER_WEEK} sessions a week, Monday and Wednesday mornings. No deadline.</p>
</header>

<div class="tiles">
  <div class="tile">
    <span class="tile-label">Topics done</span>
    <span class="tile-value">{progress.done} of {progress.total}</span>
  </div>
  <div class="tile">
    <span class="tile-label">At this pace</span>
    <span class="tile-value">{progress.weeksLeft} {progress.weeksLeft === 1 ? 'week' : 'weeks'} left</span>
    {#if progress.finish}<span class="tile-note">around {formatShort(parseDate(progress.finish))}</span>{/if}
  </div>
</div>

{#if next}
  <p><a class="button" href="#/study/{next.number}">Next: #{next.number} {next.title}</a></p>
{/if}

{#if revision.length}
  <section>
    <h2>Needs revision</h2>
    <ul class="list links">
      {#each revision as topic (topic.id)}
        <li><a href="#/study/{topic.number}"><span class="label">#{topic.number} {topic.title}</span></a></li>
      {/each}
    </ul>
  </section>
{/if}

{#each blocks as block (block.name)}
  <section>
    <h2>{block.name}</h2>
    <ul class="list links">
      {#each block.items as topic (topic.id)}
        <li class:done={!!topic.doneDate}>
          <a href="#/study/{topic.number}">
            <span class="label">#{topic.number} {topic.title}</span>
            {#if status(topic)}<span class="detail">{status(topic)}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/each}
