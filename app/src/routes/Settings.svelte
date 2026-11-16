<script lang="ts">
  // Settings (F57): everything you can set up or change, in one place. Some of it can also be
  // changed on its own page; the links go there.
  import { ALL_FEATURES, FEATURE_GROUPS } from '../lib/features'
  import { live } from '../lib/live.svelte'
  import { getFeatures, getTracking, updateFeatures, updateTracking } from '../lib/repo'
  import { SECTION_DEFAULTS, addSection, deleteSection, listSections, sectionShelf, singular, updateSection, type CustomSection } from '../lib/media'

  const tracking = live(() => getTracking, { periods: false })
  const features = live(() => getFeatures, ALL_FEATURES)
  const on = $derived(features.current)

  // Your own sections in More (F77).
  const sections = live(() => listSections, [] as CustomSection[])
  let adding = $state(false)
  let added = $state<{ title: string; href: string } | null>(null)
  const blank = () => ({ title: '', one: '', log: '', want: '', done: '', by: '', stars: false })
  let draft = $state(blank())

  async function submitSection(event: SubmitEvent) {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) return
    const id = await addSection({ ...draft, title })
    added = { title, href: `#/shelf/${id}` }
    draft = blank()
    adding = false
  }

  const tabsOf = (section: CustomSection) => {
    const info = sectionShelf(section)
    return `${info.log} · ${info.want} · ${info.done}${info.by ? ` · with ${info.by.toLowerCase()}` : ''} · ${info.stars ? 'stars' : 'thumbs'}`
  }

  type SectionField = 'title' | 'one' | 'log' | 'want' | 'done' | 'by'
  type Change = (changes: Partial<CustomSection>) => void

  /** A new section follows each key; an existing one saves when you leave the field (an empty name is ignored). */
  function fieldEvents(section: Omit<CustomSection, 'id'>, change: Change, field: SectionField) {
    const value = (event: Event) => (event.currentTarget as HTMLInputElement).value
    if (!('id' in section)) return { oninput: (event: Event) => change({ [field]: value(event) }) }
    return {
      onchange: (event: Event) => {
        const text = value(event).trim()
        if (field !== 'title' || text) change({ [field]: text })
      },
    }
  }

  function removeSection(section: CustomSection) {
    if (window.confirm(`Delete "${section.title}" and everything in it? To keep what's in it, untick it instead.`)) void deleteSection(section.id)
  }
</script>

{#snippet sectionFields(section: Omit<CustomSection, 'id'>, change: Change)}
  <label>
    Name
    <input type="text" value={section.title} placeholder="Podcasts" {...fieldEvents(section, change, 'title')} />
  </label>
  <label>
    One of them
    <input type="text" value={section.one} placeholder={singular(section.title) || 'podcast'} {...fieldEvents(section, change, 'one')} />
  </label>
  <label>
    Tab for what you're on now
    <input type="text" value={section.log} placeholder={SECTION_DEFAULTS.log} {...fieldEvents(section, change, 'log')} />
  </label>
  <label>
    Tab for what you'd like to get to
    <input type="text" value={section.want} placeholder={SECTION_DEFAULTS.want} {...fieldEvents(section, change, 'want')} />
  </label>
  <label>
    Tab for what you finished
    <input type="text" value={section.done} placeholder={SECTION_DEFAULTS.done} {...fieldEvents(section, change, 'done')} />
  </label>
  <label>
    A second field (optional)
    <input type="text" value={section.by} placeholder="Artist, Host, Author…" {...fieldEvents(section, change, 'by')} />
  </label>
  <div class="field">
    <span class="field-label" id="stars-{'id' in section ? section.id : 'new'}">Rating</span>
    <div class="seg" role="group" aria-labelledby="stars-{'id' in section ? section.id : 'new'}">
      <button type="button" aria-pressed={!section.stars} onclick={() => change({ stars: false })}>Thumbs</button>
      <button type="button" aria-pressed={section.stars} onclick={() => change({ stars: true })}>1–5 stars</button>
    </div>
  </div>
{/snippet}

{#snippet link(href: string, label: string, detail: string)}
  <li><a {href}><span class="label">{label}</span><span class="detail">{detail}</span></a></li>
{/snippet}

<header>
  <h1>Settings</h1>
  <p class="date">Everything you set up or change, in one place.</p>
</header>

<section>
  <h2>Your setup</h2>
  <ul class="list more-list">
    {@render link('#/setup', 'Setup', 'Colours, meds, habits, targets, food guidelines, reminder times, backups')}
    {#if on.goals}{@render link('#/goals', 'Goals', 'Add and change goals, their progress lines and targets')}{/if}
  </ul>
</section>

<section>
  <h2>What you use</h2>
  <p class="small">Turn off what you don't use and it's hidden everywhere: Today, Plans, Upcoming, Insights, Me and the reminders. What you logged stays, and comes back if you turn it on again.</p>
  {#each FEATURE_GROUPS as group (group.title)}
    <div class="card padded feature-group">
      <span class="field-label">{group.title}</span>
      {#each group.items as item (item.key)}
        <label class="inline-check feature">
          <input type="checkbox" checked={on[item.key]} onchange={(event) => updateFeatures({ [item.key]: event.currentTarget.checked })} />
          <span class="text">
            <span class="label">{item.label}</span>
            {#if item.detail}<span class="detail">{item.detail}</span>{/if}
          </span>
        </label>
      {/each}
    </div>
  {/each}
  <div class="card padded feature-group sections-card">
    <span class="field-label">Your own sections in More</span>
    <p class="muted small">Anything else you keep a list of: podcasts, albums, board games, courses… Each gets the same tabs as Books: on now, want to, finished and favourites.</p>
    {#each sections.current as section (section.id)}
      {@const info = sectionShelf(section)}
      <div class="section-row">
        <label class="inline-check feature">
          <input type="checkbox" checked={!section.off} onchange={(event) => updateSection(section.id, { off: !event.currentTarget.checked })} />
          <span class="text">
            <span class="label">{info.title}</span>
            <span class="detail">{tabsOf(section)}</span>
          </span>
        </label>
        <details class="section-edit">
          <summary>Change</summary>
          <div class="edit-panel">
            {@render sectionFields(section, (changes) => updateSection(section.id, changes))}
            <p class="small"><a href={info.href}>Open {info.title}</a></p>
            <button type="button" class="link danger" onclick={() => removeSection(section)}>Delete this section</button>
          </div>
        </details>
      </div>
    {/each}
    {#if added}<p class="small" role="status">Added. <a href={added.href}>Open {added.title}</a>, or find it in More.</p>{/if}
    {#if adding}
      <form class="edit-panel section-form" onsubmit={submitSection}>
        {@render sectionFields(draft, (changes) => Object.assign(draft, changes))}
        <div class="row-actions">
          <button type="submit" class="button small" disabled={!draft.title.trim()}>Add the section</button>
          <button type="button" class="link" onclick={() => (adding = false)}>Cancel</button>
        </div>
      </form>
    {:else}
      <button type="button" class="button small secondary add-section" onclick={() => ((adding = true), (added = null))}>+ Add a section</button>
    {/if}
  </div>
</section>

<section>
  <h2>Tracking</h2>
  <div class="card padded">
    <label class="inline-check">
      <input type="checkbox" checked={tracking.current.periods} onchange={(event) => updateTracking({ periods: event.currentTarget.checked })} />
      Track periods
    </label>
    <p class="muted small">Adds a drop next to Energy on Today to mark a period day. Insights shows them on the calendar and compares your energy. No predictions, only the days you mark.</p>
  </div>
</section>

<section>
  <h2>Plans and lists</h2>
  <ul class="list more-list">
    {@render link('#/tracks', 'Tracks', 'Anything you work at: steps, time toward a goal, a weekly focus')}
    {@render link('#/week', 'Your week', 'Activities on each day: tracks and your own')}
    {#if on.exercise}{@render link('#/exercise', 'Exercise plan', 'Blocks, moves and reps, cardio, yoga or pilates')}{/if}
    {@render link('#/routines', 'Routines', 'Add, rename or change how often (the pencil on each)')}
    {@render link('#/lists', 'Lists', 'Your lists and whether they show on Today')}
  </ul>
</section>

{#if on.recipes || on.shopping}
<section>
  <h2>Food and home</h2>
  <ul class="list more-list">
    {#if on.recipes}{@render link('#/recipes', 'Recipes', 'Your go-to meals')}{/if}
    {#if on.shopping}{@render link('#/shopping', 'Shopping', 'Tabs, staples and one-off things')}{/if}
  </ul>
</section>
{/if}

<section>
  <h2>App</h2>
  <ul class="list more-list">
    {@render link('#/sync', 'Sync and reminders', 'Share data between your phone and PC; notifications at your times')}
    {@render link('#/ai', 'AI analysis', 'Export for an AI, analyses you keep, connect Claude (off unless you turn it on)')}
  </ul>
</section>
