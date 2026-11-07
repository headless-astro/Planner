<script lang="ts">
  import QrCode from '../components/QrCode.svelte'
  import { getStart, type StartMode } from '../lib/start'
  import { formatDate } from '../lib/dates'
  import { live } from '../lib/live.svelte'
  import { currentSubscription, reminderSupport, sendTestReminder, turnOffReminders, turnOnReminders, type ReminderSupport } from '../lib/push'
  import { getReminders } from '../lib/repo'
  import { DEFAULT_REMINDERS } from '../lib/setup'
  import {
    connect,
    createInvite,
    disconnect,
    getSyncState,
    inviteLinkFor,
    isServerOwner,
    linkFor,
    syncNow,
    type SyncConfig,
    type SyncState,
  } from '../lib/sync'

  const sync = live(() => getSyncState, { config: null, lastSync: null, error: null } as SyncState)
  const reminders = live(() => getReminders, DEFAULT_REMINDERS)

  let address = $state('')
  let busy = $state(false)
  let message = $state<string | null>(null)
  let support = $state<ReminderSupport | null>(null)
  let subscribed = $state(false)
  let showLink = $state(false)
  let copied = $state(false)
  let clock = $state(Date.now())

  const config = $derived(sync.current.config)
  const start = live<StartMode | null>(() => getStart, null)
  const link = $derived(config ? linkFor(config, location.href, start.current === 'mine' || start.current === null) : '')

  // Inviting someone (F66): only the server's owner can, and each invite works once.
  let owner = $state(false)
  let invite = $state<{ code: string; expires: number; link: string } | null>(null)
  let inviteCopied = $state(false)

  $effect(() => {
    const current = config
    if (current) void isServerOwner(current).then((value) => (owner = value))
  })

  function makeInvite(current: SyncConfig) {
    void run(async () => {
      const made = await createInvite(current)
      invite = { ...made, link: inviteLinkFor({ server: current.server, code: made.code }, location.href) }
      inviteCopied = false
    })
  }

  async function copyInvite() {
    if (!invite) return
    await navigator.clipboard.writeText(invite.link)
    inviteCopied = true
  }

  async function refreshReminders() {
    support = await reminderSupport()
    subscribed = !!(await currentSubscription())
  }

  $effect(() => {
    void refreshReminders()
    // Keeps "synced 2 min ago" current.
    const timer = setInterval(() => (clock = Date.now()), 30_000)
    return () => clearInterval(timer)
  })

  /** Runs an action with the buttons disabled, and shows what happened. */
  async function run(action: () => Promise<unknown>, done?: string) {
    busy = true
    message = null
    try {
      await action()
      if (done) message = done
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    } finally {
      busy = false
    }
  }

  function synced(time: number | null): string {
    if (!time) return 'Not synced yet'
    const minutes = Math.floor((clock - time) / 60_000)
    if (minutes < 1) return 'Synced just now'
    if (minutes < 60) return `Synced ${minutes} min ago`
    if (minutes < 24 * 60) return `Synced ${Math.floor(minutes / 60)} h ago`
    return `Synced on ${formatDate(new Date(time))}`
  }

  function submit(event: SubmitEvent) {
    event.preventDefault()
    void run(() => connect(address), 'Connected. Everything on this device is going up to the server now.')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link)
    copied = true
  }

  async function test(current: SyncConfig) {
    const result = await sendTestReminder(current)
    if (result === 'gone') {
      await refreshReminders()
      throw new Error('The browser dropped this device’s reminders. Turn them on again.')
    }
    if (result !== 'sent') throw new Error('The push service didn’t take the test. Try again in a minute.')
  }

  function stop(current: SyncConfig) {
    if (!window.confirm('Stop syncing on this device? Your data stays here and on the server.')) return
    void run(async () => {
      await turnOffReminders(current).catch(() => undefined)
      await disconnect()
      await refreshReminders()
    }, 'This device no longer syncs.')
  }
</script>

<header>
  <h1>Sync and reminders</h1>
  <p class="date">Your phone and PC share the same data, and each one can remind you at your times.</p>
</header>

{#if message}<p class="notice" role="status">{message}</p>{/if}

{#if !config}
  <section>
    <h2>Connect this device</h2>
    <p class="small">
      Sync goes through your own free Cloudflare server. On your first device, paste its address here. Other devices connect with a link from this screen, so
      you only type it once.
    </p>
    <form class="add-row" onsubmit={submit}>
      <!-- Plain text, so an address pasted without https:// isn't refused by the browser. -->
      <input
        class="grow"
        type="text"
        inputmode="url"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        bind:value={address}
        placeholder="https://planner-sync.name.workers.dev"
        aria-label="Server address"
      />
      <button type="submit" class="button" disabled={busy}>Connect</button>
    </form>
  </section>
{:else}
  <section>
    <h2>Sync</h2>
    <div class="card padded">
      <p class="sync-line"><strong>Connected</strong> to {new URL(config.server).host}</p>
      <p class="small muted sync-line">{synced(sync.current.lastSync)}</p>
      {#if sync.current.error}<p class="small late sync-line">{sync.current.error}</p>{/if}
      <div class="actions">
        <button type="button" class="button small" disabled={busy} onclick={() => run(syncNow)}>Sync now</button>
      </div>
    </div>
  </section>

  <section>
    <h2>Add another device</h2>
    {#if showLink}
      <div class="card padded">
        <p class="small sync-line">On the other device, scan this with the camera or open the link. It holds your key, so keep it to yourself.</p>
        <QrCode text={link} label="QR code that connects another device" />
        <div class="actions">
          <button type="button" class="button small secondary" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
          <button type="button" class="link" onclick={() => (showLink = false)}>Hide</button>
        </div>
      </div>
    {:else}
      <button type="button" class="button secondary" onclick={() => (showLink = true)}>Show the link and QR code</button>
    {/if}
  </section>

  {#if owner}
    <section>
      <h2>Invite someone</h2>
      <p class="small">
        Someone else can use the app with their own private space on your server. They don't see your data, and you don't see theirs. Each invite works
        once, for a week.
      </p>
      {#if invite}
        <div class="card padded">
          <p class="small sync-line">They open this link or scan the code on their phone. Their code: <strong>{invite.code}</strong></p>
          <QrCode text={invite.link} label="QR code that invites someone" />
          <div class="actions">
            <button type="button" class="button small secondary" onclick={copyInvite}>{inviteCopied ? 'Copied' : 'Copy link'}</button>
            <button type="button" class="link" onclick={() => (invite = null)}>Hide</button>
          </div>
        </div>
      {:else}
        <button type="button" class="button secondary" disabled={busy} onclick={() => makeInvite(config)}>Make an invite</button>
      {/if}
    </section>
  {/if}

  <section>
    <h2>Reminders on this device</h2>
    <p class="small">At {reminders.current.morning} and {reminders.current.night}. You can change the times in <a href="#/setup">Setup</a>.</p>
    {#if support === 'unsupported'}
      <p class="small muted">This browser can't show reminders.</p>
    {:else if support === 'blocked'}
      <p class="small late">Notifications are blocked for this site. Allow them in the browser's site settings, then come back here.</p>
    {:else if support === 'no-worker'}
      <p class="small muted">Reminders work in the installed app. Open it from your home screen or app list.</p>
    {:else if support === 'ready' && subscribed}
      <p class="small"><strong>On</strong> for this device.</p>
      <div class="actions">
        <button type="button" class="button small secondary" disabled={busy} onclick={() => run(() => test(config), 'Sent. It shows up in a few seconds.')}>
          Send a test
        </button>
        <button
          type="button"
          class="link"
          disabled={busy}
          onclick={() =>
            run(async () => {
              await turnOffReminders(config)
              await refreshReminders()
            }, 'Reminders are off for this device.')}>Turn off</button
        >
      </div>
    {:else if support === 'ready'}
      <button
        type="button"
        class="button"
        disabled={busy}
        onclick={() =>
          run(async () => {
            await turnOnReminders(config)
            await refreshReminders()
          }, 'Reminders are on for this device.')}>Turn on reminders</button
      >
    {/if}
  </section>

  <section>
    <h2>This device</h2>
    <button type="button" class="link danger" disabled={busy} onclick={() => stop(config)}>Stop syncing on this device</button>
  </section>
{/if}
