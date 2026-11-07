// What you use (F63): each part of the app can be turned off, and then it's hidden everywhere.
// The data stays, so turning it back on brings it all back. Devices from before this default
// to everything on; someone starting fresh starts with the plans that were made for one person
// turned off (D71).
import type { DayTemplate } from './setup'

export interface Features {
  exercise: boolean
  food: boolean
  diary: boolean
  work: boolean
  energy: boolean
  body: boolean
  books: boolean
  games: boolean
  movies: boolean
  shows: boolean
  recipes: boolean
  shopping: boolean
  goals: boolean
}

export type Feature = keyof Features

export const ALL_FEATURES: Features = {
  exercise: true,
  food: true,
  diary: true,
  work: true,
  energy: true,
  body: true,
  books: true,
  games: true,
  movies: true,
  shows: true,
  recipes: true,
  shopping: true,
  goals: true,
}

/** A new person starts without the plans made for one person; they can turn any of them on. */
export const FRESH_FEATURES: Features = {
  ...ALL_FEATURES,
  exercise: false,
  food: false,
  body: false,
}

export const FEATURE_GROUPS: { title: string; items: { key: Feature; label: string; detail: string }[] }[] = [
  {
    title: 'Plans',
    items: [{ key: 'exercise', label: 'Exercise plan', detail: 'Workouts on Today from the active block, and the Fitness count' }],
  },
  {
    title: 'Today',
    items: [
      { key: 'food', label: 'Food guidelines', detail: '"How did eating go?" and the guidelines' },
      { key: 'diary', label: 'Food diary', detail: 'A box for what you ate' },
      { key: 'work', label: 'Work rating', detail: '– 1 2 3 for how work went' },
      { key: 'energy', label: 'Energy', detail: '1–3 for how your energy was' },
      { key: 'body', label: 'Weigh-ins', detail: 'Weight and waist on the weigh-in day, the chart' },
    ],
  },
  {
    title: 'More and Me',
    items: [
      { key: 'books', label: 'Books', detail: '' },
      { key: 'games', label: 'Games', detail: '' },
      { key: 'movies', label: 'Movies', detail: '' },
      { key: 'shows', label: 'Shows', detail: '' },
      { key: 'recipes', label: 'Recipes', detail: '' },
      { key: 'shopping', label: 'Shopping', detail: '' },
      { key: 'goals', label: 'Goals', detail: '' },
    ],
  },
]

/** A day of the week with the parts that are turned off taken out (F63). */
export function dayWithFeatures(day: DayTemplate, features: Features): DayTemplate {
  return {
    ...day,
    workout: features.exercise ? day.workout : 'rest',
    foodRules: features.food && day.foodRules,
    weighIn: features.body && day.weighIn,
  }
}

/** A week with nothing planned yet, for someone starting fresh: just Sunday's review. */
export const FRESH_WEEK: DayTemplate[] = Array.from({ length: 7 }, (_, index) => ({
  morning: 'free' as const,
  workout: 'rest' as const,
  spanish: null,
  foodRules: false,
  weighIn: false,
  activities: [],
  review: index === 6,
}))
