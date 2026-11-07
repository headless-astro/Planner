// The goal pace for weight (D26), used by the chart and the goals.
import { daysBetween, parseDate } from './dates'

/** Where the weight would be at the goal pace (D26), `date` days after the first weigh-in. */
export function goalWeight(start: { date: string; value: number }, date: string, perWeek: number): number {
  return start.value - (perWeek * daysBetween(parseDate(start.date), parseDate(date))) / 7
}
