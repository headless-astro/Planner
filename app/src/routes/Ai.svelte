<script lang="ts">
  // AI analysis (F73–F76): your data written out for any AI, the analyses you keep, and
  // connecting Claude (or another AI) to read it directly. Connecting is off unless turned on.
  import {
    addAnalysis,
    analysisExport,
    deleteAnalysis,
    downloadText,
    getAiState,
    getSignInCode,
    listAnalyses,
    renameAnalysis,
    serverHasConnector,
    turnAiOff,
    turnAiOn,
    type AiState,
  } from '../lib/ai'
  import { SPANS, type AnalysisSpan } from '../lib/analysis'
  import { ALL_PARTS, type AnalysisParts } from '../lib/analysisText'
  import { formatDate, parseDate, todayISO } from '../lib/dates'
  import { live } from '../lib/live.svelte'
  import { getSyncState, syncNow, type SyncState } from '../lib/sync'
  import AddToggle from '../components/AddToggle.svelte'

  const sync = live(() => getSyncState, { config: null, lastSync: null, error: null } as SyncState)
  const ai = live(() => getAiState, { connect: false, sentAt: null, error: null } as AiState)
  const analyses = live(() => listAnalyses, [])
  const config = $derived(sync.current.config)

  let busy = $state(false)
  let message = $state<string | null>(null)
  /** Where the message shows: next to what was pressed, so it's on screen. */
  let messageAt = $state<'top' | 'connect' | 'code'>('top')

  async function run(action: () => Promise<unknown>, done?: string, where: typeof messageAt = 'top') {
    busy = true
    message = null
    messageAt = where
    try {
      await action()
      if (done) message = done
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    } finally {
      busy = false
    }
  }

  // ── Export (F73) ──
  let span = $state<AnalysisSpan>(4)
  let parts = $state<AnalysisParts>({ ...ALL_PARTS })
  let copied = $state(false)
  const PART_LABELS: { key: keyof AnalysisParts; label: string; detail: string }[] = [
    { key: 'trends', label: 'Weekly trends', detail: 'Habits against targets, tracks, workouts, eating, energy, work, weight, meds' },
    { key: 'notes', label: 'Notes', detail: 'Weekly review notes, day notes and notes on what you did' },
    { key: 'food', label: 'Food diary', detail: 'What you ate each day, next to how eating went, and your guidelines' },
  ]
  const nothingPicked = $derived(!parts.trends && !parts.notes && !parts.food)

  function copyExport() {
    void run(async () => {
      await navigator.clipboard.writeText(await analysisExport(span, parts))
      copied = true
      setTimeout(() => (copied = false), 3000)
    })
  }

  function downloadExport() {
    void run(async () => downloadText(`planner-for-ai-${todayISO()}.md`, await analysisExport(span, parts)))
  }

  // ── Analyses you keep (F75) ──
  let title = $state('')
  let text = $state('')
  let open = $state<string | null>(null)
  let adding = $state(false)

  function save(event: SubmitEvent) {
    event.preventDefault()
    if (!text.trim()) return
    void run(async () => {
      await addAnalysis(title, text)
      title = ''
      text = ''
      adding = false
    }, 'Saved. It shows under Insights too.')
  }

  async function importFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    text = await file.text()
    if (!title) title = file.name.replace(/\.(md|markdown|txt)$/i, '')
  }

  function remove(id: string, name: string) {
    if (window.confirm(`Delete “${name}”?`)) void deleteAnalysis(id)
  }

  // ── Connecting an AI (F74) ──
  let ready = $state<boolean | null>(null)
  let code = $state<{ code: string; expires: number } | null>(null)
  let addressCopied = $state(false)
  const address = $derived(config ? `${config.server}/mcp` : '')

  $effect(() => {
    const current = config
    if (current && ai.current.connect) void serverHasConnector(current).then((value) => (ready = value))
  })

  function toggle(on: boolean) {
    const current = config
    if (on && current) {
      void run(() => turnAiOn(current, syncNow), 'On. Your weekly summary is on your server now; it updates after each sync.', 'connect')
    } else if (!on) {
      if (!window.confirm('Turn off Connect an AI? Your server deletes the summary, and every AI that’s connected is signed out.')) return
      code = null
      void run(() => turnAiOff(current, syncNow), 'Off. The summary is deleted from your server, and every AI is signed out.', 'connect')
    }
  }

  function newCode() {
    const current = config
    if (!current) return
    void run(async () => {
      await syncNow()
      code = await getSignInCode(current)
    }, undefined, 'code')
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(address)
    addressCopied = true
  }

  const minutesLeft = (expires: number) => Math.max(0, Math.round((expires - Date.now()) / 60_000))
  const when = (time: number) => {
    const minutes = Math.floor((Date.now() - time) / 60_000)
    return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 24 * 60 ? `${Math.floor(minutes / 60)} h ago` : `on ${formatDate(new Date(time))}`
  }
</script>

<header>
  <h1>AI analysis</h1>
  <p class="date">Hand your trends, notes and food diary to an AI, and keep what it tells you.</p>
</header>

{#if message && messageAt === 'top'}<p class="notice" role="status">{message}</p>{/if}

<section>
  <h2>Export for an AI</h2>
  <p class="small">A text file any AI can read: Claude, ChatGPT, Gemini or another. Paste it into a chat, or attach the file, and ask what it notices.</p>
  <div class="card padded">
    <span class="field-label">How far back</span>
    <div class="seg" role="group" aria-label="How far back">
      {#each SPANS as choice (choice.id)}
        <button type="button" aria-pressed={span === choice.id} onclick={() => (span = choice.id)}>{choice.label}</button>
      {/each}
    </div>
    <span class="field-label ai-parts">What to include</span>
    {#each PART_LABELS as part (part.key)}
      <label class="inline-check feature">
        <input type="checkbox" bind:checked={parts[part.key]} />
        <span class="text">
          <span class="label">{part.label}</span>
          <span class="detail">{part.detail}</span>
        </span>
      </label>
    {/each}
    <div class="actions">
      <button type="button" class="button" disabled={busy || nothingPicked} onclick={copyExport}>{copied ? 'Copied' : 'Copy'}</button>
      <button type="button" class="button secondary" disabled={busy || nothingPicked} onclick={downloadExport}>Download</button>
    </div>
  </div>
  <p class="muted small">This isn't a backup: it's a readable summary, and it can't be imported back. Backups are in <a href="#/setup">Setup</a>.</p>
</section>

<section>
  <div class="with-add section-head">
    <div><h2>Saved analyses</h2></div>
    <AddToggle bind:open={adding} label="Keep an analysis" />
  </div>
  {#if adding}
    <form class="card padded ai-save" onsubmit={save}>
      <label class="field">
        <span class="field-label">Title</span>
        <input type="text" bind:value={title} placeholder="October: energy and eating" />
      </label>
      <label class="field">
        <span class="field-label">What the AI said</span>
        <textarea rows="8" bind:value={text} placeholder="Paste the AI's answer here"></textarea>
      </label>
      <div class="actions">
        <button type="submit" class="button" disabled={busy || !text.trim()}>Save</button>
        <label class="button secondary">
          From a file
          <input type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" class="visually-hidden" onchange={importFile} />
        </label>
      </div>
    </form>
  {/if}
  {#if analyses.current.length}
    <ul class="list ai-list">
      {#each analyses.current as item (item.id)}
        <li class="ai-item">
          <button type="button" class="ai-head" aria-expanded={open === item.id} onclick={() => (open = open === item.id ? null : item.id)}>
            <span class="label">{item.title}</span>
            <span class="detail">{formatDate(parseDate(item.date))}{item.by ? ` · ${item.by}` : item.source === 'pasted' ? ' · pasted in' : ''}</span>
          </button>
          {#if open === item.id}
            <div class="ai-text">{item.text}</div>
            <div class="actions">
              <button type="button" class="button small secondary" onclick={() => navigator.clipboard.writeText(item.text)}>Copy</button>
              <button
                type="button"
                class="link"
                onclick={() => {
                  const name = window.prompt('Title', item.title)
                  if (name !== null) void renameAnalysis(item.id, name)
                }}>Rename</button
              >
              <button type="button" class="link danger" onclick={() => remove(item.id, item.title)}>Delete</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">None yet. Paste one in with +, or let a connected AI save it for you.</p>
  {/if}
</section>

<section>
  <h2>Connect an AI</h2>
  <p class="small">
    Lets Claude (or any AI app that takes connectors) read your planner itself, whenever you ask it to, and save its analyses here. It uses your own Claude
    plan: there's no extra cost.
  </p>
  {#if !config}
    <p class="small muted">This needs sync first: set it up in <a href="#/sync">Sync and reminders</a>.</p>
  {:else}
    <div class="card padded">
      <label class="inline-check">
        <input type="checkbox" checked={ai.current.connect} disabled={busy} onchange={(event) => toggle(event.currentTarget.checked)} />
        <span class="text">
          <span class="label">Connect an AI</span>
          <span class="detail">Off by default. While it's on, a summary of your weeks (the same as the export) is kept on your server for the AI to read.</span>
        </span>
      </label>
      {#if ai.current.connect}
        {#if ai.current.error}
          <p class="small late">{ai.current.error}</p>
        {:else if ai.current.sentAt}
          <p class="small muted">Summary updated {when(ai.current.sentAt)}.</p>
        {/if}
        {#if ready === false}
          <p class="small late">Your server needs an update before an AI can connect. The steps are in the plan's to-do list.</p>
        {/if}
      {/if}
      {#if message && messageAt === 'connect'}<p class="notice" role="status">{message}</p>{/if}
    </div>

    {#if ai.current.connect}
      <div class="card padded ai-steps">
        <span class="field-label">The connector's address</span>
        <p class="ai-address">{address}</p>
        <div class="actions">
          <button type="button" class="button small secondary" onclick={copyAddress}>{addressCopied ? 'Copied' : 'Copy address'}</button>
        </div>

        <span class="field-label">In Claude (web, desktop or phone)</span>
        <ol class="small">
          <li>Open Customize → Connectors and choose “Add custom connector”.</li>
          <li>Paste the address above and name it, like Planner.</li>
          <li>When it asks you to sign in, get a code below, type it in and press Allow.</li>
          <li>In a chat, switch it on from the “+” menu → Connectors, and ask something like “How did my last month go?”</li>
        </ol>
        <p class="small muted">In some versions of Claude, Connectors is under Settings.</p>

        <span class="field-label">In Claude Code</span>
        <p class="ai-address small">claude mcp add --transport http planner {address}</p>
        <p class="small muted">Then type /mcp in Claude Code and sign in.</p>

        <span class="field-label">Sign-in code</span>
        {#if code}
          <p class="ai-code">{code.code}</p>
          <p class="small muted">Works once, for {minutesLeft(code.expires)} more minutes.</p>
        {/if}
        {#if message && messageAt === 'code'}<p class="small late" role="alert">{message}</p>{/if}
        <div class="actions">
          <button type="button" class="button small" disabled={busy || ready === false} onclick={newCode}>{code ? 'Get a new code' : 'Get a sign-in code'}</button>
        </div>
      </div>
      <p class="muted small">Turning this off deletes the summary from your server and signs every AI out. Analyses you saved stay here.</p>
    {/if}
  {/if}
</section>

<style>
  .ai-list {
    margin-top: 8px;
  }
  .ai-parts {
    display: block;
    margin-top: 14px;
  }
  .section-head {
    align-items: center;
  }
  .section-head h2 {
    margin: 0;
  }
  .ai-save {
    margin: 8px 0 12px;
  }
  .ai-save textarea {
    width: 100%;
    box-sizing: border-box;
  }
  .ai-item {
    padding: 12px 14px;
  }
  .ai-item + .ai-item {
    border-top: 1px solid var(--line);
  }
  .ai-head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ai-text {
    margin-top: 10px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .ai-steps {
    margin-top: 12px;
  }
  .ai-steps .field-label {
    display: block;
    margin-top: 14px;
  }
  .ai-steps .field-label:first-child {
    margin-top: 0;
  }
  .ai-steps ol {
    margin: 6px 0;
    padding-left: 1.2rem;
  }
  .ai-address {
    margin: 6px 0;
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
  }
  .ai-code {
    margin: 6px 0 2px;
    font-family: ui-monospace, monospace;
    font-size: 1.6rem;
    letter-spacing: 0.15em;
  }
</style>
