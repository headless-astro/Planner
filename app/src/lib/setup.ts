// The starting setup, taken from the plan. On first run the editable parts (meds, habits,
// targets, snack list, reminder times) are copied into the database on this device and
// changed from the Setup screen. The weekly rhythm and the programs stay here for now.

export type TimeOfDay = 'morning' | 'anytime' | 'evening'

export const DEFAULT_DOSES: { id: string; label: string; time: TimeOfDay }[] = [
  { id: 'med-empty', label: 'Meds · empty stomach', time: 'morning' },
  { id: 'med-breakfast', label: 'Meds · with breakfast', time: 'morning' },
  { id: 'med-anytime', label: 'Meds · any time', time: 'anytime' },
  { id: 'med-dinner', label: 'Meds · with dinner', time: 'evening' },
]

/** Quick daily ticks shown under "Also today". */
export const DEFAULT_HABITS: { id: string; label: string; weeklyTarget: number | null }[] = [
  { id: 'read', label: 'Read', weeklyTarget: 2 },
  { id: 'cooked', label: 'Cooked', weeklyTarget: 1 },
  { id: 'chores', label: 'Chores', weeklyTarget: 4 },
  { id: 'drawing', label: 'Drawing', weeklyTarget: 1 },
  { id: 'crafts', label: 'Crafts', weeklyTarget: null },
  { id: 'movie', label: 'Movie/Show', weeklyTarget: null },
]

export interface Targets {
  /** Weekly targets, in days or sessions. */
  rules: number
  fitness: number
  spanish: number
  study: number
  /** Daily snack budget in kcal (PLAN.md D30). */
  snackBudget: number
  /** The weight goal's pace in kg a week, for the chart's goal line; null for none (F64). */
  weeklyLoss: number | null
}

export const DEFAULT_TARGETS: Targets = { rules: 6, fitness: 6, spanish: 4, study: 2, snackBudget: 200, weeklyLoss: 0.4 }

export interface Reminders {
  morning: string
  night: string
}

export const DEFAULT_REMINDERS: Reminders = { morning: '12:00', night: '00:00' }

/** Rough calories per portion (PLAN.md 7.1). */
export const DEFAULT_SNACKS: { id: string; name: string; kcal: number }[] = [
  { id: 'snack-biscuit', name: 'Small plain biscuit', kcal: 35 },
  { id: 'snack-digestive', name: 'Digestive biscuit', kcal: 70 },
  { id: 'snack-chocolate', name: '2 squares dark chocolate', kcal: 55 },
  { id: 'snack-date', name: 'Date or dried apricot', kcal: 20 },
  { id: 'snack-apple', name: 'Medium apple', kcal: 90 },
  { id: 'snack-mandarin', name: 'Mandarin', kcal: 45 },
  { id: 'snack-almonds', name: '10 almonds', kcal: 70 },
  { id: 'snack-hazelnuts', name: '10 hazelnuts', kcal: 85 },
  { id: 'snack-walnuts', name: '7 walnut halves', kcal: 90 },
  { id: 'snack-leblebi', name: '30 g leblebi', kcal: 110 },
  { id: 'snack-popcorn', name: '3 cups popcorn', kcal: 95 },
  { id: 'snack-pickles', name: 'Pickles, cucumber, carrots', kcal: 20 },
  { id: 'snack-cacik', name: 'Veg sticks + cacık', kcal: 75 },
]

// ── The weekly rhythm (PLAN.md 7.0) ──

export type MorningBlock = 'tech' | 'spanish-book' | 'drawing' | 'free' | 'review' | 'custom'
export type WorkoutKind = 'strength' | 'cardio' | 'yoga' | 'long-cardio' | 'rest'
export type SpanishKind = 'video' | 'exercise' | 'reading'

/** What a week's activity logs when it's ticked (F70). */
export type ActivityLog = 'done' | 'step' | 'minutes' | 'pages'

/** One thing on a day of the week: a track, or something in your own words (F70). */
export interface Activity {
  id: string
  part: TimeOfDay
  trackId?: string
  /** For your own activities: what it is. */
  text?: string
  /** A short note for that day, like "1 video" or "Book". */
  note?: string
  log: ActivityLog
}

export interface DayTemplate {
  morning: MorningBlock
  workout: WorkoutKind
  /** The day's Spanish floor (PLAN.md 7.5), or null for none. */
  spanish: SpanishKind | null
  /** False on the free day. */
  foodRules: boolean
  weighIn: boolean
  /** The morning slot in your own words, when it's "custom" (F64). */
  morningText?: string
  /** The day's activities (F70). Days from before have none, and follow their slots above. */
  activities?: Activity[]
  /** The weekly review is on this day; days from before have it as their morning slot. */
  review?: boolean
}

/** Monday first. Changed on the Week screen (F30); this is the starting week. */
export const WEEK_TEMPLATE: DayTemplate[] = [
  { morning: 'tech', workout: 'strength', spanish: 'video', foodRules: true, weighIn: false },
  { morning: 'spanish-book', workout: 'cardio', spanish: 'video', foodRules: true, weighIn: false },
  { morning: 'tech', workout: 'yoga', spanish: 'video', foodRules: true, weighIn: false },
  { morning: 'spanish-book', workout: 'strength', spanish: 'video', foodRules: true, weighIn: false },
  { morning: 'drawing', workout: 'cardio', spanish: 'exercise', foodRules: true, weighIn: false },
  { morning: 'free', workout: 'long-cardio', spanish: 'reading', foodRules: true, weighIn: true },
  { morning: 'review', workout: 'rest', spanish: null, foodRules: false, weighIn: false },
]

/** Names for the week editor's choices. */
export const MORNING_BLOCKS: Record<MorningBlock, string> = {
  tech: 'Tech study',
  'spanish-book': 'Spanish book',
  drawing: 'Drawing',
  review: 'Weekly review',
  custom: 'Your own…',
  free: 'Free',
}

export const WORKOUTS: Record<WorkoutKind, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  yoga: 'Yoga or pilates',
  'long-cardio': 'Longer cardio or badminton',
  rest: 'Rest',
}

/** The Spanish floor for each kind of practice. */
export const SPANISH_FLOORS: Record<SpanishKind, string> = {
  video: 'Spanish: 1 video',
  exercise: 'Spanish: revise / exercise',
  reading: 'Spanish: reading book',
}

// ── Food guidelines, Monday to Saturday (PLAN.md 7.1, D25, D74). Shown on Today, changed in Setup. ──

export const DEFAULT_FOOD_RULES: string[] = [
  'Three meals, none skipped: a first meal soon after waking, a main meal mid-afternoon, dinner in the evening.',
  'Every meal follows the plate: half vegetables, a quarter protein, a quarter carbs.',
  'No junk: crisps and chips, pastries, fast food, sugary drinks, and sweets beyond the snack guideline.',
  'Snacks: about 200 kcal a day in all. Sweet is fine within that, best right after a meal.',
  'The kitchen closes at 00:00. After that, only water or unsweetened tea.',
  'If the meal at home doesn’t fit, adjust it or cook: more vegetables and protein, fewer carbs.',
  'A slip is one meal, not a lost day. The next meal goes back to the guidelines.',
]

// ── Colours (F28) ──

export type Palette = 'lavender' | 'mint' | 'peach' | 'rose' | 'sky'

/** The swatch is the palette's accent, for the picker in Setup. */
export const PALETTES: { id: Palette; name: string; swatch: string }[] = [
  { id: 'lavender', name: 'Lavender', swatch: '#c9b8f2' },
  { id: 'mint', name: 'Mint', swatch: '#a6dfc6' },
  { id: 'peach', name: 'Peach', swatch: '#f8c8a6' },
  { id: 'rose', name: 'Rose', swatch: '#f3bbcc' },
  { id: 'sky', name: 'Sky', swatch: '#b1d2f2' },
]

export interface Appearance {
  palette: Palette
}

export const DEFAULT_APPEARANCE: Appearance = { palette: 'lavender' }

// ── Tech study (PLAN.md 7.4, Appendix B) ──

export const TECH_FLOOR = '10 minutes that fill the row'

const TOPIC_ROWS: [block: string, title: string, subtopics: string][] = [
  ['A. C# language', 'Revision: value vs reference, structs vs classes, properties', 'Copying, passing, modifying vs reassigning; struct in class; props returning structs; boxing recap. Say it out loud without notes'],
  ['A. C# language', 'Parameter passing & enums', 'Value params; ref / out / in; when each; enums, underlying types, flags'],
  ['A. C# language', 'Inheritance & polymorphism', 'Base/derived; virtual / override / abstract; encapsulation; public/private/protected/internal; static vs instance'],
  ['A. C# language', 'Interfaces', 'What they are; interface vs inheritance; interface references; connection to boxing'],
  ['A. C# language', 'Generics', 'Why they exist; List<T>; generic methods/classes; constraints; relationship to boxing'],
  ['A. C# language', 'Delegates', 'Delegate types; Action / Func; multicast delegates'],
  ['A. C# language', 'Events', 'Delegate vs event; subscribe / unsubscribe; why events exist; leaks from forgetting -='],
  ['A. C# language', 'Lambdas & closures', 'Anonymous functions; captured variables; common Unity use cases and pitfalls'],
  ['A. C# language', 'Collections', 'Array, List, Dictionary, HashSet, Queue, Stack; choosing the right one; Big-O of each'],
  ['A. C# language', 'LINQ', 'What it does; when useful; why problematic in hot Unity paths (allocations)'],
  ['A. C# language', 'Exceptions, nullables, equality', 'try/catch/finally; not for gameplay flow; Nullable<T>, ?, null; == vs .Equals() vs reference equality'],
  ['A. C# language', 'const / readonly / var + strings', 'const vs readonly; what var really means; string immutability, concat vs interpolation vs StringBuilder'],
  ['B. Unity fundamentals', 'MonoBehaviour lifecycle', 'Awake, OnEnable, Start, Update, FixedUpdate, LateUpdate, OnDisable, OnDestroy; execution order'],
  ['B. Unity fundamentals', 'Coroutines', 'IEnumerator; StartCoroutine; yield return; what they are; what they are NOT (not threads)'],
  ['B. Unity fundamentals', 'Serialization, deeper', 'Scene/prefab serialization; [System.Serializable]; [SerializeReference]; serialization callbacks'],
  ['B. Unity fundamentals', 'ScriptableObjects', 'What they are; when to use; data sharing; avoiding duplicated data'],
  ['B. Unity fundamentals', 'GameObjects & Components', 'Component architecture; GetComponent / TryGetComponent; component communication'],
  ['B. Unity fundamentals', 'Unity events vs C# events; prefabs', 'UnityEvent vs C# event trade-offs; prefab system, variants, overrides'],
  ['B. Unity fundamentals', 'Instantiate / Destroy & scene management', 'Runtime allocations; lifecycle implications; scene loading basics'],
  ['C. Performance', 'GC & allocation patterns', 'Garbage-producing patterns: boxing, LINQ, string concat, closures, temp collections; reading allocation data'],
  ['C. Performance', 'Object pooling (build one)', 'Implement a small generic pool; discuss when not to pool'],
  ['C. Performance', 'CPU vs GPU, draw calls', 'Draw calls; batches / batching; GPU instancing; what actually costs'],
  ['C. Performance', 'Profiler & Memory Profiler', 'Hands-on: profile one of your own scenes; find one spike and explain it'],
  ['C. Performance', 'Update-loop, struct vs class, physics perf', 'Avoiding per-frame work; struct vs class from a perf view; physics cost levers'],
  ['D. Architecture', 'SOLID, composition vs inheritance', 'SOLID with one Unity example each; coupling vs cohesion'],
  ['D. Architecture', 'Patterns: Singleton, Factory, Object Pool', 'Revisit Singleton critically; Factory; Object Pool as a pattern'],
  ['D. Architecture', 'Patterns: Observer, Command; event-driven', 'Observer vs C# events; Command (undo); event-driven architecture'],
  ['D. Architecture', 'Patterns: Strategy, State', 'Strategy; State (relate to Animator / gameplay FSMs)'],
  ['D. Architecture', 'DI, data-driven design, MVC/MVP/MVVM', 'Dependency injection; interfaces vs abstract classes; data-driven; MV* (relate to Luna / UI Toolkit)'],
  ['E. Unity gameplay', 'Physics', 'Rigidbody; colliders; triggers; FixedUpdate; collision detection modes; raycasting; layers & LayerMasks'],
  ['E. Unity gameplay', 'Input & Animation', 'Input System; Animator, Animator Controller, state machines, animation events'],
  ['E. Unity gameplay', 'UI architecture', 'Canvas; UI Toolkit vs UGUI; event systems. You know this, so practise the 2-minute interview answer'],
  ['E. Unity gameplay', 'Addressables & asset management', 'Addressables; asset management; async scene loading'],
  ['E. Unity gameplay', 'Multithreading, Jobs, Burst, DOTS', 'Tasks vs coroutines; Jobs System; Burst; ECS/DOTS concepts (conceptual level)'],
  ['F. Interview practice', 'Big-O & data structures', 'Time complexity; basic data structures; searching / sorting; recursion'],
  ['F. Interview practice', 'Debugging & reading code', 'Debugging methodology; reading unfamiliar code; finding performance problems'],
  ['F. Interview practice', 'Design a small gameplay system', 'Whiteboard one system end-to-end; explain architectural decisions out loud'],
]

export const DEFAULT_TOPICS = TOPIC_ROWS.map(([block, title, subtopics], index) => ({
  id: `topic-${index + 1}`,
  number: index + 1,
  block,
  title,
  subtopics,
}))

// ── Spanish (PLAN.md 7.5, D37, D38, D43) ──

export const SPANISH_BOOK_FLOOR = 'one exercise set or one page'

export interface SpanishSettings {
  /** The unit to continue from after the review sessions. */
  startUnit: number
  reviewSessions: number
}

export const DEFAULT_SPANISH: SpanishSettings = { startUnit: 3, reviewSessions: 2 }

/** Dreaming Spanish levels by hours of input. Markers, not deadlines (D37). */
export const DS_LEVELS = [
  { level: 2, hours: 50 },
  { level: 3, hours: 150 },
  { level: 4, hours: 300 },
  { level: 5, hours: 600 },
  { level: 6, hours: 1000 },
  { level: 7, hours: 1500 },
]

// ── Recipes: your go-to meals (PLAN.md 7.1) ──

export const DEFAULT_RECIPES: { id: string; name: string; meal: string; batch: boolean; freezes: boolean }[] = [
  { id: 'recipe-lentil-soup', name: 'Lentil soup (mercimek)', meal: 'Any meal', batch: true, freezes: true },
  { id: 'recipe-tray-bake', name: 'Chicken and vegetable tray bake', meal: 'Main', batch: true, freezes: false },
  { id: 'recipe-kofte', name: 'Meatballs (köfte) with roasted vegetables and yogurt', meal: 'Main', batch: true, freezes: true },
  { id: 'recipe-salmon', name: 'Baked salmon with roasted vegetables', meal: 'Main', batch: false, freezes: false },
  { id: 'recipe-dolma', name: 'Stuffed peppers or courgettes (dolma)', meal: 'Main', batch: true, freezes: true },
  { id: 'recipe-sote', name: 'Chicken or beef stir-fry with vegetables (sote)', meal: 'Main', batch: true, freezes: false },
  { id: 'recipe-chicken-soup', name: 'Chicken and vegetable soup', meal: 'Any meal', batch: true, freezes: true },
  { id: 'recipe-green-lentil', name: 'Green lentil stew (yeşil mercimek), no meat', meal: 'Main', batch: true, freezes: true },
  { id: 'recipe-turlu', name: 'Türlü: mixed vegetable stew with meat', meal: 'Main', batch: true, freezes: true },
  { id: 'recipe-karniyarik', name: 'Oven karnıyarık', meal: 'Main', batch: true, freezes: true },
  { id: 'recipe-sis', name: 'Chicken şiş with roasted vegetables and yogurt', meal: 'Main', batch: false, freezes: false },
]

// ── Drawing (PLAN.md 7.6, D36): Friday mornings, one area a week ──

/** The exercises and sources are starting suggestions, changed on the Drawing screen. */
export const DEFAULT_DRAWING_AREAS: { id: string; name: string; exercises: string[]; sources: string[] }[] = [
  {
    id: 'drawing-anatomy',
    name: 'Anatomy',
    exercises: [
      'The big masses: rib cage, pelvis and skull, from 3 angles',
      'Copy one muscle group from a reference, then draw it again from memory',
      'Hands: 10 quick studies of your own hand',
    ],
    sources: [
      'Proko: anatomy and figure drawing videos',
      'Book: Figure Drawing for All It’s Worth, Andrew Loomis',
      'Book: Figure Drawing: Design and Invention, Michael Hampton',
    ],
  },
  {
    id: 'drawing-gesture',
    name: 'Gesture & movement',
    exercises: [
      'Timed poses: 10 × 1 minute, then 4 × 5 minutes',
      'One curve for the line of action first, then the rest of the pose',
      'People moving in a video: pause, draw for 30 seconds, repeat',
    ],
    sources: ['Line of Action or Quickposes: timed pose photos', 'Proko: gesture drawing lessons'],
  },
  {
    id: 'drawing-composition',
    name: 'Dynamic composition',
    exercises: [
      '6 small thumbnails of one scene, 2 minutes each',
      'Copy a film or game still as simple shapes in three values',
      'One subject, three framings: close-up, medium, wide',
    ],
    sources: ['Book: Framed Ink, Marcos Mateu-Mestre', 'Stills from films and games you like'],
  },
  {
    id: 'drawing-light',
    name: 'Light & values',
    exercises: [
      'A 5-step value scale, then shade a sphere with it',
      'A cube, a cylinder and an egg under one lamp, with their cast shadows',
      'Squint at a photo and draw it in three values: light, middle, dark',
    ],
    sources: ['Book: Color and Light, James Gurney'],
  },
  {
    id: 'drawing-concept',
    name: 'Concept',
    exercises: [
      '10 silhouettes of one character or prop, then develop the best one',
      'A prop for your game, in 3 variations',
      'Shape language: one design from circles, one from squares, one from triangles',
    ],
    sources: ['Drawabox, free lessons in construction and perspective: https://drawabox.com', 'Book: How to Draw, Scott Robertson'],
  },
]

// ── Craft projects and goals (PLAN.md 1.8) ──

export const DEFAULT_PROJECTS: { id: string; name: string; kind: string }[] = [
  { id: 'project-frog', name: 'Frog', kind: 'Crochet' },
  { id: 'project-heart-bag', name: 'Heart Bag', kind: 'Crochet' },
  { id: 'project-flower-dice', name: 'Flower Dice', kind: 'Dice' },
]

/** Where a goal's progress line comes from. */
/**
 * Where a goal's progress line comes from: something you log, or a track ("track:<id>", F69).
 * Goals from before may say drawing, study or spanish: those follow the tracks they became.
 */
export type GoalMeasure = 'weight' | 'fitness' | 'food-rules' | 'reading' | 'drawing' | 'study' | 'spanish' | `track:${string}`

export const DEFAULT_GOALS: { id: string; title: string; parentId: string | null; measure: GoalMeasure | null }[] = [
  { id: 'goal-health', title: 'Improve health', parentId: null, measure: null },
  { id: 'goal-weight', title: 'Weight loss', parentId: 'goal-health', measure: 'weight' },
  { id: 'goal-fitness', title: 'Getting fit', parentId: 'goal-health', measure: 'fitness' },
  { id: 'goal-eating', title: 'Better eating habits', parentId: 'goal-health', measure: 'food-rules' },
  { id: 'goal-drawing', title: 'Improve technical drawing skills', parentId: null, measure: 'drawing' },
  { id: 'goal-tech', title: 'Improve technical knowledge', parentId: null, measure: 'study' },
  { id: 'goal-spanish', title: 'Learn Spanish', parentId: null, measure: 'spanish' },
]

// ── Primer 2 (PLAN.md 7.2) ──

/** Week 1 is 2–8 Nov. */
export const PRIMER_START = '2026-11-02'
export const PRIMER_WEEKS = 4

export const WARM_UP = 'Warm-up, 5 min: easy elliptical or marching, arm circles, hip circles, hip hinges'

/** Reps per week, weeks 1–4. */
export const STRENGTH_MOVES: { name: string; reps: string[] }[] = [
  { name: 'Squat to a chair → goblet squat', reps: ['10, no weight', '10, goblet', '12, goblet', '12, goblet, slow down'] },
  { name: 'Push-up on handles, knees down', reps: ['6', '8', '10', '12, or try full push-ups'] },
  { name: 'One-arm dumbbell row, forearm on a table', reps: ['10 per side', '10 per side', '12 per side', '12 per side'] },
  { name: 'Glute bridge', reps: ['12', '15', '12, dumbbell on hips', '15, dumbbell on hips'] },
  { name: 'Seated dumbbell shoulder press, palms in', reps: ['8', '10', '10', '12'] },
  { name: 'Reverse lunge, hold a counter', reps: ['6 per side', '8 per side', '10 per side', '8 per side, with dumbbells'] },
  { name: 'Dead bug', reps: ['6 per side', '8 per side', '10 per side', '10 per side'] },
]
export const STRENGTH_ROUNDS = [2, 2, 3, 3]

export const CARDIO = ['20 min, easy', '25 min, last 5 brisk', '30 min: 3 × (3 brisk, 2 easy)', '35 min: 4 × (3 brisk, 2 easy)']
export const LONG_CARDIO = ['30 min, easy', '35 min, easy', '40 min, easy to brisk', '45 min, easy to brisk']

export const YOGA_TIPS = [
  'Forearms instead of hands: forearm plank, dolphin instead of downward dog',
  'Fists or push-up handles in all-fours poses',
  'Skip poses with weight on bent wrists',
]

// ── Routines (the Maintenance sheet, PLAN.md Appendix C) ──

/** Routines in this area also tick Chores for the day (D17). */
export const CHORES_AREA = 'Cleaning'

export const DEFAULT_ROUTINES: { id: string; name: string; area: string; intervalDays: number }[] = [
  { id: 'routine-manicure', name: 'Manicure', area: 'Self-care', intervalDays: 21 },
  { id: 'routine-pedicure', name: 'Pedicure', area: 'Self-care', intervalDays: 21 },
  { id: 'routine-nails', name: 'Nail polish/gel', area: 'Self-care', intervalDays: 7 },
  { id: 'routine-peeling', name: 'Peeling', area: 'Self-care', intervalDays: 14 },
  { id: 'routine-mask', name: 'Mask', area: 'Self-care', intervalDays: 5 },
  { id: 'routine-laser', name: 'Laser', area: 'Self-care', intervalDays: 21 },
  { id: 'routine-brows', name: 'Brows', area: 'Self-care', intervalDays: 14 },
  { id: 'routine-scrub', name: 'Body scrub', area: 'Self-care', intervalDays: 7 },
  { id: 'routine-vacuum', name: 'Vacuum', area: CHORES_AREA, intervalDays: 5 },
  { id: 'routine-dusting', name: 'Dusting', area: CHORES_AREA, intervalDays: 7 },
  { id: 'routine-windows', name: 'Windows', area: CHORES_AREA, intervalDays: 30 },
  { id: 'routine-ironing', name: 'Ironing', area: CHORES_AREA, intervalDays: 7 },
  { id: 'routine-pillowcase', name: 'Pillow case', area: CHORES_AREA, intervalDays: 7 },
]

// ── Task lists (PLAN.md S11, S20) ──

export const DEFAULT_LISTS: { id: string; name: string; showOnToday: boolean }[] = [
  { id: 'list-life', name: 'Life', showOnToday: true },
  { id: 'list-work', name: 'Work', showOnToday: true },
  { id: 'list-vela', name: 'Vela', showOnToday: false },
]

// ── Staples to keep at hand (PLAN.md 7.1) ──

export const DEFAULT_STAPLES: { id: string; name: string; group: string }[] = [
  ...[
    'Seasonal fruit',
    'Cucumbers',
    'Carrots',
    'Pickles',
    'Popcorn kernels',
    'Dark chocolate (70%+)',
    'Plain biscuits',
    'Dates or dried apricots',
    'Almonds or hazelnuts',
    'Zero-kcal drinks',
  ].map((name) => ({ name, group: 'Light snacks' })),
  ...['Strained yogurt (süzme)', 'Kefir', 'Oats', 'Chia or flax seeds', 'Frozen berries', 'Walnuts', 'Cinnamon'].map((name) => ({
    name,
    group: 'First meals',
  })),
  ...[
    'Chicken',
    'Canned tuna',
    'Frozen vegetables',
    'Whole-grain wraps',
    'Red lentils',
    'Green lentils',
    'Bulgur',
    'Tomato paste',
    'Onions',
    'Garlic',
    'Lemons',
    'Olive oil',
  ].map((name) => ({ name, group: 'Quick meals' })),
].map((staple, index) => ({ id: `staple-${index + 1}`, ...staple }))

// ── Practice tracks (PLAN.md 7.9) ──

export const DEFAULT_TRACKS: { id: string; name: string; start: string; weeks: number; weekdays: number[]; focus: string[] }[] = [
  {
    id: 'track-driving',
    name: 'Driving practice',
    start: '2026-11-07',
    weeks: 4,
    weekdays: [5],
    focus: ['Car controls and quiet streets', 'Turns, junctions and roundabouts', 'Parking', 'Busier roads and a longer drive'],
  },
]
