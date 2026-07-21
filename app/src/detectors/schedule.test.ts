import { describe, expect, it } from 'vitest'
import { MIN_NEW_WORDS, shouldScan, type ScanGate } from './schedule'

/** An open gate; each test closes exactly one condition. */
const open = (over: Partial<ScanGate> = {}): ScanGate => ({
  configured: true,
  powered: true,
  inFlight: false,
  now: 1_000_000,
  backoffUntil: 0,
  lastScanAt: 0,
  pollIntervalMs: 20_000,
  minWords: 80,
  wordCount: 500,
  wordCountAtLastScan: 400,
  ...over,
})

describe('shouldScan', () => {
  it('opens when everything is satisfied', () => {
    expect(shouldScan(open())).toBe(true)
  })

  // Each of these costs money if it leaks through.
  it.each([
    ['no key / detector off', { configured: false }],
    ['on standby', { powered: false }],
    ['a scan already in flight', { inFlight: true }],
    ['inside the backoff window', { backoffUntil: 1_000_001 }],
  ])('stays shut with %s', (_label, over) => {
    expect(shouldScan(open(over))).toBe(false)
  })

  it('holds the poll interval, then opens once it elapses', () => {
    const now = 1_000_000
    expect(shouldScan(open({ now, lastScanAt: now - 19_999, pollIntervalMs: 20_000 }))).toBe(false)
    expect(shouldScan(open({ now, lastScanAt: now - 20_000, pollIntervalMs: 20_000 }))).toBe(true)
  })

  it('waits for enough total words for the verdict to mean anything', () => {
    expect(shouldScan(open({ wordCount: 79, minWords: 80, wordCountAtLastScan: 0 }))).toBe(false)
    expect(shouldScan(open({ wordCount: 80, minWords: 80, wordCountAtLastScan: 0 }))).toBe(true)
  })

  it('will not re-scan until enough new words have arrived', () => {
    // Guards against paying twice for a window that has barely moved.
    const base = { wordCount: 500 }
    expect(
      shouldScan(open({ ...base, wordCountAtLastScan: 500 - (MIN_NEW_WORDS - 1) })),
    ).toBe(false)
    expect(shouldScan(open({ ...base, wordCountAtLastScan: 500 - MIN_NEW_WORDS }))).toBe(true)
  })

  it('lets backoff expire exactly at the boundary', () => {
    const now = 1_000_000
    expect(shouldScan(open({ now, backoffUntil: now }))).toBe(true)
  })
})
