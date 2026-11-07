<script lang="ts">
  import { untrack } from 'svelte'
  import { getStart, startDevice, type StartMode } from '../lib/start'
  import { connect, getSyncConfig, newKey, readInvite } from '../lib/sync'

  // Opened from an invite link someone made for you (F66): your own private space on their server.
  let { payload, onstarted }: { payload: string; onstarted: () => void } = $props()

  // Read once: the code is taken out of the address bar straight after.
  const invite = readInvite(untrack(() => payload))

  let busy = $state(false)
  let error = $state<string | null>(null)
  let done = $state(false)
  let started = $state<StartMode | null | undefined>(undefined)
  let syncing = $state(false)

  $effect(() => {
    if (payload) history.replaceState(null, '', `${location.pathname}${location.search}#/join`)
    void getStart().then((value) => (started = value))
    void getSyncConfig().then((config) => (syncing = !!config))
  })

  async function join(mode: StartMode | null) {
    if (!invite) return
    busy = true
    error = null
    try {
      // Set up first, so everything goes up with the first sync.
      if (mode) await startDevice(mode)
      // A new key: a new person, with their own space.
      await connect(invite.server, newKey(), invite.code)
      done = true
      onstarted()
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem)
    } finally {
      busy = false
    }
  }
</script>

<header>
  <h1>Join</h1>
</header>

{#if !invite}
  <p class="notice">This invite link is incomplete. Ask for a new one, and copy all of it.</p>
{:else if done}
  <p class="notice" role="status">You're in. Your planner is yours alone: nobody else on this server sees it.</p>
  <p><a class="button" href="#/today">Go to Today</a></p>
{:else if syncing}
  <p class="notice">This device already syncs with a planner. To join as someone new, open the link in another browser or on another device.</p>
{:else if started !== undefined}
  <p>You've been invited to use the planner with your own private space on <strong>{new URL(invite.server).host}</strong>. Nobody else sees your data.</p>
  {#if started === null}
    <section class="welcome">
      <button type="button" class="card welcome-choice" disabled={busy} onclick={() => join('examples')}>
        <span class="label">Join, with examples</span>
        <span class="detail">A few habits, routines and a list, to show how it works.</span>
      </button>
      <button type="button" class="card welcome-choice" disabled={busy} onclick={() => join('empty')}>
        <span class="label">Join, starting empty</span>
        <span class="detail">Nothing filled in. Add your own as you go.</span>
      </button>
    </section>
  {:else}
    <p class="small muted">What's on this device goes into your new space.</p>
    <button type="button" class="button" disabled={busy} onclick={() => join(null)}>Join</button>
  {/if}
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
{/if}
