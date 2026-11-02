<script lang="ts" module>
  // Phosphor icons, bold weight (F32), bundled as plain SVG so they work offline and take the
  // text colour. Only the ones listed here end up in the app.
  import barbell from '@phosphor-icons/core/assets/bold/barbell-bold.svg?raw'
  import books from '@phosphor-icons/core/assets/bold/books-bold.svg?raw'
  import calendarDots from '@phosphor-icons/core/assets/bold/calendar-dots-bold.svg?raw'
  import calendarHeart from '@phosphor-icons/core/assets/bold/calendar-heart-bold.svg?raw'
  import clockCountdown from '@phosphor-icons/core/assets/bold/clock-countdown-bold.svg?raw'
  import clockCounterClockwise from '@phosphor-icons/core/assets/bold/clock-counter-clockwise-bold.svg?raw'
  import files from '@phosphor-icons/core/assets/bold/files-bold.svg?raw'
  import gear from '@phosphor-icons/core/assets/bold/gear-bold.svg?raw'
  import listChecks from '@phosphor-icons/core/assets/bold/list-checks-bold.svg?raw'
  import notebook from '@phosphor-icons/core/assets/bold/notebook-bold.svg?raw'
  import notepad from '@phosphor-icons/core/assets/bold/notepad-bold.svg?raw'
  import plusCircle from '@phosphor-icons/core/assets/bold/plus-circle-bold.svg?raw'
  import user from '@phosphor-icons/core/assets/bold/user-bold.svg?raw'

  const ICONS = {
    barbell,
    books,
    'calendar-dots': calendarDots,
    'calendar-heart': calendarHeart,
    'clock-countdown': clockCountdown,
    'clock-counter-clockwise': clockCounterClockwise,
    files,
    gear,
    'list-checks': listChecks,
    notebook,
    notepad,
    'plus-circle': plusCircle,
    user,
  } as const

  export type IconName = keyof typeof ICONS
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props()
</script>

<!-- The SVGs are files from the icon package, not anything typed into the app. -->
<span class="icon" aria-hidden="true">{@html ICONS[name]}</span>
