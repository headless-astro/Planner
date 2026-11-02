// Geometry for the weight chart: a single line with a dashed goal-pace line (PLAN.md 7.3).
// Plain functions, so the layout can be tested without a browser.
import { formatShort, parseDate } from './dates'

export interface ChartPoint {
  date: string
  value: number
}

export interface ChartDot extends ChartPoint {
  x: number
  y: number
  goal: number
}

export interface WeightChartLayout {
  width: number
  height: number
  plot: { left: number; right: number; top: number; bottom: number }
  ticks: { value: number; y: number }[]
  xLabels: { x: number; text: string; anchor: 'start' | 'end' }[]
  path: string
  goal: { x1: number; y1: number; x2: number; y2: number }
  dots: ChartDot[]
}

export const CHART_HEIGHT = 220
const MARGIN = { top: 16, right: 76, bottom: 28, left: 44 }

/** A round step that gives about 3–5 gridlines. */
export function niceStep(range: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 20]) if (range / step <= 4) return step
  return 50
}

/**
 * Lays out weigh-ins (oldest first; at least two) on a chart `width` pixels wide. The goal line
 * starts at the first weigh-in and drops `perWeek` kg a week.
 */
export function weightChartLayout(points: readonly ChartPoint[], width: number, perWeek: number): WeightChartLayout {
  const first = points[0]
  const last = points[points.length - 1]
  const day = 86_400_000
  const time = (date: string) => parseDate(date).getTime()
  const goalAt = (date: string) => first.value - (perWeek * Math.round((time(date) - time(first.date)) / day)) / 7

  const values = [...points.map((point) => point.value), goalAt(last.date)]
  const low = Math.min(...values)
  const high = Math.max(...values)
  const step = niceStep(Math.max(high - low, 0.5))
  const min = Math.floor((low - step / 4) / step) * step
  const max = Math.ceil((high + step / 4) / step) * step

  const plot = { left: MARGIN.left, right: width - MARGIN.right, top: MARGIN.top, bottom: CHART_HEIGHT - MARGIN.bottom }
  const span = Math.max(1, time(last.date) - time(first.date))
  const x = (date: string) => plot.left + ((time(date) - time(first.date)) / span) * (plot.right - plot.left)
  const y = (value: number) => plot.top + ((max - value) / (max - min)) * (plot.bottom - plot.top)

  const ticks = []
  for (let value = min; value <= max + step / 1000; value += step) ticks.push({ value: Math.round(value * 10) / 10, y: y(value) })

  const dots = points.map((point) => ({ ...point, x: x(point.date), y: y(point.value), goal: goalAt(point.date) }))
  const shortDate = (date: string) => formatShort(parseDate(date)).slice(4)

  return {
    width,
    height: CHART_HEIGHT,
    plot,
    ticks,
    xLabels: [
      { x: plot.left, text: shortDate(first.date), anchor: 'start' },
      { x: plot.right, text: shortDate(last.date), anchor: 'end' },
    ],
    path: dots.map((dot, index) => `${index ? 'L' : 'M'}${dot.x.toFixed(1)},${dot.y.toFixed(1)}`).join(' '),
    goal: { x1: x(first.date), y1: y(first.value), x2: x(last.date), y2: y(goalAt(last.date)) },
    dots,
  }
}

/** The index of the dot closest to a horizontal position. */
export function nearestDot(dots: readonly { x: number }[], px: number): number {
  let best = 0
  for (let index = 1; index < dots.length; index++) {
    if (Math.abs(dots[index].x - px) < Math.abs(dots[best].x - px)) best = index
  }
  return best
}
