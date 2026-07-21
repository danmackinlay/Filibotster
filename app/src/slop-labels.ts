/**
 * The instrument's score vocabulary, in ascending slop order.
 *
 * Shared deliberately: `ui/dial.ts` paints these onto the dial face and
 * `main.ts` puts the current one in the readout headline. They drifted apart
 * once before (see docs/follow-ups.md), so there is exactly one copy.
 */
export const SLOP_LABELS = [
  'ARTISANAL',
  'FREE-RANGE',
  'FOCUS-GROUPED',
  'REHEATED',
  'PURE SLOP',
] as const

/** The zone name a 0..1 score falls in. Out-of-range scores clamp to the ends. */
export function labelFor(score: number): string {
  const band = Math.floor(score * SLOP_LABELS.length)
  return SLOP_LABELS[Math.max(0, Math.min(SLOP_LABELS.length - 1, band))]
}
