<script lang="ts">
  // A title's cover (F78), or its first letter while there's none. A cover that was never looked
  // up is looked up once the row scrolls into view, so a long list only asks for what you see.
  import { queueCover, type CoverQuery } from '../lib/covers'
  import type { MediaItem } from '../lib/db'

  let { item, query }: { item: MediaItem; query: CoverQuery } = $props()

  let box = $state<HTMLElement | null>(null)
  // A picture that's gone from the site shows the letter instead.
  let broken = $state<string | null>(null)
  const url = $derived(item.cover && item.cover !== broken ? item.cover : null)
  const letter = $derived(Array.from(item.title.trim())[0]?.toUpperCase() ?? '?')

  $effect(() => {
    if (item.cover !== undefined || !box) return
    const current = item
    const lookup = query
    if (typeof IntersectionObserver === 'undefined') {
      queueCover(current, lookup)
      return
    }
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        queueCover(current, lookup)
      }
    })
    observer.observe(box)
    return () => observer.disconnect()
  })
</script>

<span class="cover" bind:this={box} aria-hidden="true">
  {#if url}
    <img src={url} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror={() => (broken = url)} />
  {:else}
    <span class="cover-letter">{letter}</span>
  {/if}
</span>
