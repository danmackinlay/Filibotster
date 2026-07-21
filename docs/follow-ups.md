# Follow-up notes

Deferred items from the code-quality tidy on 2026-07-10. The tidy itself
(shared `CloudDetector` interface, `DetectorError`, dead-code cull, the
`pangram`→`cloud` naming pass) is already landed; this file is the "not now,
but worth knowing" list so the reasoning isn't lost.

## Deferred refactors

### Extract the cloud scheduler out of `main.ts`
**Partially done (2026-07-21).** The decision *whether* to spend a credit is now
a pure function in `app/src/detectors/schedule.ts` (`shouldScan`), covered by
`schedule.test.ts`. That was the part where a mistake costs real money, so it
was worth pulling out first and is the cheap half of this item.

Still outstanding: `main.ts` is the composition root (~400 lines, 15
module-level mutable bindings) and the scheduler's *state* still lives there —
`cloudInFlight` / `lastScanAt` / `lastScanWords` / `backoffUntil` /
`dispatchSpan` / `verdictAt` / `verdictSpan` plus the `setInterval` driving
`maybeScanCloud()`.

A `CloudScheduler` class owning that state — constructed with the active
detector, a settings getter, the `Needle`, and a small "ports" object of UI
callbacks (pill, freshness readout, diagnostics, banner) — would shrink
`main.ts` further. Still tightly coupled to UI updates; medium effort, medium
risk. `shouldScan` is already extracted, so the remaining work is the state
machine and its UI side effects.

## Deliberate non-changes (look like debt, aren't)

### The two relay files are near-duplicates — on purpose
`worker/src/index.js` (Cloudflare) and `netlify/functions/task.mjs` (Netlify)
are ~90% identical. Do **not** factor them into a shared module: SPEC §3.5
wants each deploy target self-contained and trivially portable, and sharing
code would couple the two platforms and defeat "clone one file to port it."
The right anti-duplication here is keeping the *contract* trivial, which it is.
If one changes, hand-mirror the change to the other.

## Latent features (dead code was removed — here's how to revive it)

### Slop label in the readout for lexical-only mode
**Done (2026-07-21.)** Became urgent when `cloudDetector` started defaulting to
`'none'`: `#readout-headline` is only written on a cloud verdict, so the default
user got a permanently blank line that still reserved `min-height: 1.2em`.

`app/src/slop-labels.ts` now owns the five strings as `SLOP_LABELS` plus
`labelFor(score)`; `ui/dial.ts` maps them onto its own `ZONE_ANGLES` and
`main.ts`'s `renderHeadline()` fills the headline from `needle.value` — but only
when no cloud detector is configured, so a real verdict still owns that line.
Covered by `slop-labels.test.ts`.

### Per-window / per-sentence transcript tinting (SPEC §3.4)
The parsing for this was removed as dead (`ScoredWindow`,
`PangramVerdict.windows`, `SaplingVerdict.sentenceScores`). SPEC §3.4 still
describes tinting transcript spans red/amber by the detector's sub-window
labels. If built, re-add the parsing at the point the consumer exists (Pangram
returns window char-offsets + labels; Sapling returns per-sentence scores) —
don't carry the plumbing ahead of the feature again.

## Tooling gaps

- **No linter / formatter.** `tsc --strict` (with `noUnusedLocals` /
  `noUnusedParameters`) is the only automated check. That's a defensible choice
  for a small vanilla-TS project, but note it does **not** catch unread
  *interface fields* or unused *exported* members — which is exactly the class
  of rot the 2026-07 tidy cleaned up manually. An ESLint pass with
  `@typescript-eslint` (esp. `no-unused-vars` on types is still limited, but
  rules like `no-explicit-any` and consistent-imports would help) is the
  natural next guard if this keeps recurring.
- **Tests: started (2026-07-21).** Vitest is wired up (`npm --prefix app test`,
  no config file needed). 21 tests cover the lexical scorer
  (`detectors/lexical.test.ts`), the scan gate (`detectors/schedule.test.ts`)
  and the label bands (`slop-labels.test.ts`). Still untested by design: the UI
  glue in `main.ts` and the two network clients. Note the lexical tests assert
  *direction and shape*, not exact magnitudes, so `slop-lexicon.json` stays
  tunable without breaking the build.
