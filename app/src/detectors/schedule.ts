/**
 * The gate in front of every paid scan.
 *
 * Kept pure and separate from `main.ts` because this is the one piece of the
 * cloud scheduler where a mistake costs real money — each `true` is a billable
 * request. See docs/follow-ups.md for the larger CloudScheduler extraction this
 * is a first step towards.
 */

/** New words required since the last scan before spending another credit. */
export const MIN_NEW_WORDS = 20

export interface ScanGate {
  /** detector selected and holding an API key */
  configured: boolean
  /** the instrument is on — standby never bills */
  powered: boolean
  /** a scan is already in flight */
  inFlight: boolean
  now: number
  /** set after a 429/402 to stop hammering a rate-limited or empty account */
  backoffUntil: number
  lastScanAt: number
  pollIntervalMs: number
  /** words the detector needs before a verdict means anything */
  minWords: number
  wordCount: number
  wordCountAtLastScan: number
}

export function shouldScan(g: ScanGate): boolean {
  if (!g.configured || !g.powered || g.inFlight) return false
  if (g.now < g.backoffUntil) return false
  if (g.now - g.lastScanAt < g.pollIntervalMs) return false
  if (g.wordCount < g.minWords) return false
  return g.wordCount - g.wordCountAtLastScan >= MIN_NEW_WORDS
}
