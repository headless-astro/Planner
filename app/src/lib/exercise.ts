// Exercise blocks (F59, D69, D76): Primer, Easy and Intermediate, 4 weeks each, all editable.
// One is active at a time; it starts at week 1 on the day you pick it, and loops back to week 1
// after week 4. Which days are strength, cardio or yoga stays on the Week screen. Plain
// functions; saving them is in repo.ts.
import { addDays, formatShort, parseDate, toISODate, weekSince } from './dates'
import { CARDIO, LONG_CARDIO, PRIMER_START, STRENGTH_MOVES, STRENGTH_ROUNDS, WARM_UP, YOGA_TIPS } from './setup'

export type BlockId = 'primer' | 'easy' | 'intermediate'
export const BLOCK_IDS: BlockId[] = ['primer', 'easy', 'intermediate']
export const BLOCK_WEEKS = 4

export interface Move {
  name: string
  /** Reps for weeks 1–4. */
  reps: string[]
}

export interface ExerciseBlock {
  name: string
  warmUp: string
  moves: Move[]
  /** Rounds of the strength circuit, weeks 1–4. */
  rounds: number[]
  cardio: string[]
  longCardio: string[]
  yoga: string[]
}

export interface ExercisePlan {
  active: BlockId
  /** The day the active block started (week 1). */
  start: string
  blocks: Record<BlockId, ExerciseBlock>
}

const YOGA = [...YOGA_TIPS]

/** My suggestions for Easy and Intermediate, built on from Primer and still easy on the wrists (D76). */
export const DEFAULT_EXERCISE: ExercisePlan = {
  active: 'primer',
  start: PRIMER_START,
  blocks: {
    primer: {
      name: 'Primer',
      warmUp: WARM_UP,
      moves: STRENGTH_MOVES.map((move) => ({ name: move.name, reps: [...move.reps] })),
      rounds: [...STRENGTH_ROUNDS],
      cardio: [...CARDIO],
      longCardio: [...LONG_CARDIO],
      yoga: YOGA,
    },
    easy: {
      name: 'Easy',
      warmUp: WARM_UP,
      moves: [
        { name: 'Goblet squat', reps: ['10', '12', '12, slow down', '15'] },
        { name: 'Push-up on handles', reps: ['10, knees down', '12, knees down', '5 full, then knees to 12', '8 full, then knees to 12'] },
        { name: 'One-arm dumbbell row, forearm on a table', reps: ['12 per side', '12 per side, heavier', '10 per side, heavier', '12 per side, heavier'] },
        { name: 'Glute bridge, dumbbell on hips', reps: ['15', '20', '10 per side, one leg', '12 per side, one leg'] },
        { name: 'Seated dumbbell shoulder press, palms in', reps: ['10', '12', '10, heavier', '12, heavier'] },
        { name: 'Reverse lunge with dumbbells', reps: ['8 per side', '10 per side', '10 per side', '12 per side'] },
        { name: 'Forearm plank', reps: ['20 s', '30 s', '40 s', '45 s'] },
      ],
      rounds: [3, 3, 3, 4],
      cardio: ['30 min, easy to brisk', '35 min: 4 × (3 brisk, 2 easy)', '35 min: 5 × (4 brisk, 1 easy)', '40 min, brisk'],
      longCardio: ['45 min, easy', '50 min, easy', '50 min, easy to brisk', '60 min, easy to brisk'],
      yoga: YOGA,
    },
    intermediate: {
      name: 'Intermediate',
      warmUp: WARM_UP,
      moves: [
        { name: 'Goblet squat, heavier', reps: ['10', '12', '10, 3 s pause at the bottom', '15'] },
        { name: 'Push-up on handles', reps: ['8 full', '10 full', '12 full', '10, 3 s on the way down'] },
        { name: 'Bent-over dumbbell row, both arms', reps: ['10', '12', '12, heavier', '15'] },
        { name: 'One-leg glute bridge', reps: ['12 per side', '15 per side', '12 per side, dumbbell', '15 per side, dumbbell'] },
        { name: 'Standing dumbbell shoulder press', reps: ['10', '12', '10, heavier', '12, heavier'] },
        { name: 'Split squat, back foot on a chair', reps: ['6 per side', '8 per side', '10 per side', '8 per side, with dumbbells'] },
        { name: 'Side plank on the forearm', reps: ['20 s per side', '30 s per side', '40 s per side', '45 s per side'] },
      ],
      rounds: [3, 3, 4, 4],
      cardio: ['40 min: 5 × (4 brisk, 1 easy)', '40 min, brisk', '45 min: 6 × (4 brisk, 1 easy)', '45 min, brisk'],
      longCardio: ['60 min, easy to brisk', '60 min, brisk', '70 min, easy to brisk', '75 min, easy to brisk'],
      yoga: YOGA,
    },
  },
}

export interface BlockNow {
  block: ExerciseBlock
  /** 1–4, or null before the block starts. */
  week: number | null
  /** 1 the first time through, 2 the second… */
  round: number
}

/** Where the active block is on a date. After week 4 it starts over at week 1 (D76). */
export function blockNow(plan: ExercisePlan, date: Date): BlockNow {
  const block = plan.blocks[plan.active]
  const weeks = weekSince(parseDate(plan.start), date)
  if (weeks < 1) return { block, week: null, round: 1 }
  return { block, week: ((weeks - 1) % BLOCK_WEEKS) + 1, round: Math.floor((weeks - 1) / BLOCK_WEEKS) + 1 }
}

/** "Primer · week 2 of 4", "Easy · week 1 of 4, second time through" or "Primer starts Mon 9 Nov". */
export function blockText(plan: ExercisePlan, today: string): string {
  const { block, week, round } = blockNow(plan, parseDate(today))
  if (week === null) return `${block.name} starts ${formatShort(parseDate(plan.start))}`
  const times = ['', '', ', second time through', ', third time through']
  return `${block.name} · week ${week} of ${BLOCK_WEEKS}${round > 1 ? (times[round] ?? `, time ${round} through`) : ''}`
}

/** The last day of the active block's current 4 weeks. */
export function blockRoundEnd(plan: ExercisePlan, today: string): string {
  const { round } = blockNow(plan, parseDate(today))
  return toISODate(addDays(parseDate(plan.start), round * BLOCK_WEEKS * 7 - 1))
}
