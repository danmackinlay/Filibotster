import { describe, expect, it } from 'vitest'
import { SLOP_LABELS, labelFor } from './slop-labels'

describe('labelFor', () => {
  it('walks the whole vocabulary from clean to slop', () => {
    expect(labelFor(0)).toBe('ARTISANAL')
    expect(labelFor(0.5)).toBe('FOCUS-GROUPED')
    expect(labelFor(1)).toBe('PURE SLOP')
  })

  it('never falls off either end', () => {
    // The needle jitters slightly outside 0..1 (see Needle.step), so this is
    // reachable rather than defensive.
    expect(labelFor(-0.05)).toBe(SLOP_LABELS[0])
    expect(labelFor(1.05)).toBe(SLOP_LABELS[SLOP_LABELS.length - 1])
  })

  it('returns a real label for every score across the range', () => {
    for (let s = 0; s <= 1.0001; s += 0.01) {
      expect(SLOP_LABELS).toContain(labelFor(s))
    }
  })

  it('divides the range into equal bands', () => {
    const seen = SLOP_LABELS.map((_, i) => labelFor(i / SLOP_LABELS.length))
    expect(seen).toEqual([...SLOP_LABELS])
  })
})
