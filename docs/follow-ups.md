# Follow-up notes

Deferred items from the code-quality tidy on 2026-07-10. The tidy itself
(shared `CloudDetector` interface, `DetectorError`, dead-code cull, the
`pangram`→`cloud` naming pass) is already landed; this file is the "not now,
but worth knowing" list so the reasoning isn't lost.

## Deferred refactors

### Extract the cloud scheduler out of `main.ts`
`app/src/main.ts` is the composition root (~350 lines) and mostly fine, but the
cloud-detector scheduler is the one chunk with real hidden complexity:
`maybeScanCloud()` plus the module-level `cloudInFlight` / `lastScanAt` /
`lastScanWords` / `backoffUntil` / `dispatchSpan` / `verdictAt` / `verdictSpan`
state and the `setInterval` that drives it (~90 lines).

A `CloudScheduler` class owning that state — constructed with the active
detector, a settings getter, the `Needle`, and a small "ports" object of UI
callbacks (pill, freshness readout, diagnostics, banner) — would shrink
`main.ts` and make the scan/backoff logic unit-testable in isolation.

Held off because it's tightly coupled to UI updates and there are **no tests**
to catch a regression (see below). Medium effort, medium risk. Do it *with* a
couple of tests around the throttle/backoff conditions, not before.

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
The tidy removed `labelFor()` (the `ARTISANAL`→`PURE SLOP` score→label
function) because it only ever fed a `DetectorResult.label` field that nothing
rendered — the labels you see come from `ZONE_LABELS` in `app/src/ui/dial.ts`.

But in lexical-only mode (no cloud key) the `#readout-headline` element sits
blank, and a score→label string is the obvious thing to put there. To revive:
re-add a `labelFor(score)` (ideally sourcing the five strings from a shared
constant that `dial.ts` also consumes, to avoid re-duplicating the vocabulary)
and set `readoutHeadline.textContent` from it in the lexical `store.onChange`
handler in `main.ts`.

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
- **No tests.** Fine for the UI glue; the two spots with logic worth pinning are
  the lexical scorer (`app/src/detectors/lexical.ts` — pure function, trivial to
  test) and the scheduler throttle/backoff conditions (see above). Vitest drops
  into a Vite project with near-zero config.
