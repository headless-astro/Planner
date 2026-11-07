<script lang="ts">
  // The first start on a new device (F62): start with a small example, start empty, or connect
  // to another device that already has your planner.
  import { startDevice, type StartMode } from '../lib/start'

  let { onstarted }: { onstarted: () => void } = $props()

  let busy = $state(false)
  let other = $state(false)

  async function start(mode: StartMode) {
    busy = true
    try {
      await startDevice(mode)
      onstarted()
    } finally {
      busy = false
    }
  }
</script>

<header>
  <h1>Welcome</h1>
  <p class="date">A planner for your days: what's on today, routines, lists and habits, and how things are going.</p>
</header>

<section class="welcome">
  <button type="button" class="card welcome-choice" disabled={busy} onclick={() => start('examples')}>
    <span class="label">Start with examples</span>
    <span class="detail">A few habits, routines and a list, to show how it works. Change or delete any of it.</span>
  </button>
  <button type="button" class="card welcome-choice" disabled={busy} onclick={() => start('empty')}>
    <span class="label">Start empty</span>
    <span class="detail">Nothing filled in. Add your own as you go.</span>
  </button>
  <button type="button" class="card welcome-choice" aria-expanded={other} onclick={() => (other = !other)}>
    <span class="label">I already use it on another device</span>
    <span class="detail">Connect this one to it, and everything comes over.</span>
  </button>
  {#if other}
    <p class="small card padded">
      On your other device, open Settings → Sync and reminders → Add another device, and open that link (or scan its QR code) here. If someone invited you, open
      the invite link they sent.
    </p>
  {/if}
  <p class="muted small">Whichever you pick, Settings → What you use turns parts of the app on or off at any time.</p>
</section>
