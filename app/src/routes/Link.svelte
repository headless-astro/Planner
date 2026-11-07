<script lang="ts">
  import { untrack } from 'svelte'
  import { getStart, startDevice } from '../lib/start'
  import { connect, readLink } from '../lib/sync'

  // Opened from the link or QR code made on another device (D47).
  let { payload, onstarted }: { payload: string; onstarted?: () => void } = $props()

  // Read once: the key is taken out of the address bar straight after.
  const config = readLink(untrack(() => payload))

  let busy = $state(false)
  let error = $state<string | null>(null)
  let done = $state(false)

  // The link holds the key, so it shouldn't stay in the address bar or the browser's history.
  $effect(() => {
    if (payload) history.replaceState(null, '', `${location.pathname}${location.search}#/link`)
  })

  async function go() {
    if (!config) return
    busy = true
    error = null
    try {
      // On a new device, the other one brings everything: nothing is filled in here first.
      // Your own devices get your setup, as before; anyone else's start clean and sync theirs.
      if ((await getStart()) === null) await startDevice(config.mine ? 'mine' : 'link')
      await connect(config.server, config.key)
      done = true
      onstarted?.()
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem)
    } finally {
      busy = false
    }
  }
</script>

<header>
  <h1>Connect this device</h1>
</header>

{#if !config}
  <p class="notice">This link is incomplete. Make it again under More → Sync and reminders on your other device, and copy all of it.</p>
{:else if done}
  <p class="notice" role="status">Connected. Your data is syncing now.</p>
  <p><a class="button" href="#/today">Go to Today</a></p>
{:else}
  <p>This device will sync with your planner server at <strong>{new URL(config.server).host}</strong>.</p>
  <p class="small muted">Only use a link you made yourself, on your other device: everything on this device will be shared with that server.</p>
  <div class="actions">
    <button type="button" class="button" disabled={busy} onclick={go}>Connect</button>
    <a href="#/today">Not now</a>
  </div>
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
{/if}
