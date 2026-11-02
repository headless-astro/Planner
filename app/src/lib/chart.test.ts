import { describe, expect, it } from 'vitest'
import { nearestDot, niceStep, weightChartLayout } from './chart'

const points = [
  { date: '2026-11-07', value: 80 },
  { date: '2026-11-14', value: 79.4 },
  { date: '2026-11-21', value: 79.6 },
  { date: '2026-11-28', value: 78.9 },
]

describe('weight chart layout', () => {
  const layout = weightChartLayout(points, 400, 0.4)

  it('spans the plot from the first to the last weigh-in', () => {
    expect(layout.dots[0].x).toBe(layout.plot.left)
    expect(layout.dots[3].x).toBe(layout.plot.right)
  })

  it('puts heavier weights higher up, inside the gridlines', () => {
    expect(layout.dots[0].y).toBeLessThan(layout.dots[3].y)
    const top = layout.ticks[layout.ticks.length - 1].value
    const bottom = layout.ticks[0].value
    expect(bottom).toBeLessThanOrEqual(78.9)
    expect(top).toBeGreaterThanOrEqual(80)
  })

  it('drops the goal line 0.4 kg a week', () => {
    expect(layout.dots[3].goal).toBeCloseTo(78.8)
  })

  it('finds the weigh-in nearest the pointer', () => {
    expect(nearestDot(layout.dots, layout.dots[2].x + 3)).toBe(2)
  })

  it('picks round steps for the gridlines', () => {
    expect(niceStep(1.1)).toBe(0.5)
    expect(niceStep(3)).toBe(1)
    expect(niceStep(7)).toBe(2)
  })
})
