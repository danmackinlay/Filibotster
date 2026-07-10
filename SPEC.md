# Filibotster

A satirical live speech-analytics display. Point a podium microphone at it and it renders a
full-screen dial whose needle swings into the red as the speaker's recent language reads as
AI-generated slop, as judged by [Pangram](https://www.pangram.com)'s detector, with a live
transcript running underneath like subtitles.

## 1. Concept

- **Input:** live audio from the podium mic (whatever microphone the laptop sees).
- **Processing:** streaming speech-to-text → rolling transcript window → slop detectors.
- **Output:** a full-screen web page: giant analog dial ("slop-o-meter"), subtitle strip,
  small diagnostics. Designed to be projected or shown on a side screen while someone speaks.
- **Honesty note (for the README):** AI-text detectors are calibrated on written prose, not
  ASR transcripts of speech. The needle is satire, not forensics. This is a feature.

## 2. Architecture

Everything runs in the browser except one tiny relay.

```
┌────────────────────────── Browser (static SPA) ──────────────────────────┐
│                                                                          │
│  Mic ──getUserMedia──► PCM ──WebSocket──► Deepgram (BYO key, direct;     │
│                                            subprotocol auth, no CORS issue)
│                                   │                                      │
│                             transcript store                             │
│                             (rolling window)                             │
│                              │          │                                │
│                    Lexical detector   Pangram detector                   │
│                    (in-browser, free,  (every ~20s, via relay)           │
│                     continuous)              │                           │
│                              ▼               ▼                           │
│                        needle fusion ──► SVG dial + subtitles            │
└──────────────────────────────────────────────│───────────────────────────┘
                                               ▼
                                   Cloudflare Worker relay (~40 lines)
                                   adds CORS headers, forwards verbatim
                                               │
                                               ▼
                              https://text.external-api.pangram.com
```

**Why the relay exists (verified 2026-07-10):** Pangram's API rejects CORS preflights
(`OPTIONS /task` → 405, no `Access-Control-Allow-*` headers) and authenticates with an
`x-api-key` header, which forces a preflight. Browsers therefore cannot call it directly.
The Worker forwards `POST /task` and `GET /task/:id` unchanged, passing the client's
`x-api-key` header through, and adds CORS headers to responses. It stores and logs nothing.

**Trust model:** BYO keys (Pangram, Deepgram) live in `localStorage`, never leave the
user's browser except to the respective API — the Pangram key transits the relay (in
memory only). The relay URL is a config field, so the paranoid can deploy their own Worker
(`wrangler deploy`, free tier) or point at any equivalent proxy. Document this prominently.

**Why TypeScript, for a Python person:** every irreducible piece of this app — mic capture
(`getUserMedia`/`AudioWorklet`), the Deepgram websocket, rendering, config UI — lives in the
browser and must be JavaScript regardless. A Python backend would have nothing to do except
proxy Pangram, and the Worker does that in 40 lines. Choosing Python here means running and
babysitting a server to avoid writing... zero lines of Python-replaceable code. Toolchain is
kept minimal precisely because you can't audit it: **Vite + vanilla TypeScript, no framework,
no state library, no UI kit**. One `npm create vite@latest`-shaped project, `npm run dev` for
hot reload, `npm run build` emits static files deployable to GitHub Pages. The Worker is the
same language, ~1 file.

## 3. Components

### 3.1 Audio capture & STT

- `getUserMedia({ audio })` with a mic picker in config (podium feed may arrive as a USB
  interface or an aggregate device — just list all inputs).
- `AudioWorklet` downsamples to 16 kHz mono linear16 PCM, chunks of ~100 ms, sent over a
  websocket to Deepgram: `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&interim_results=true&punctuate=true`,
  authenticated via `Sec-WebSocket-Protocol: token, <key>` — this works from browsers with
  no server help, which is why Deepgram is the primary STT backend.
- Cost ≈ $0.006/min ≈ **$0.35/hour** on the user's Deepgram key.
- Interim results render in the subtitle strip (grey/italic); only **final** results enter
  the scoring transcript.
- Auto-reconnect with exponential backoff; a visible status pill (`STT: live / reconnecting / off`).
- **Web Speech API fallback:** the browser's built-in `SpeechRecognition` (Chrome/Edge/
  Safari) behind the same STT interface — free, no key, `continuous` + `interimResults`
  mapped to the same interim/final events. Used automatically when no Deepgram key is
  configured, and as a live fallback if the Deepgram socket can't be established (with a
  status-pill note, since accuracy and punctuation are worse — expect a more conservative
  Pangram read). Caveats: effectively Chrome-quality only there, audio goes to the
  browser vendor's recognizer, and it ignores the mic picker in some browsers (it uses the
  system default input); recognition restarts must be handled (`onend` → `start()` loop,
  which Chrome imposes every ~60 s).
- **AssemblyAI** as a third backend is possible but its browser story needs a temp-token
  endpoint (another relay route). Deferred to a stretch goal; the STT layer is behind a
  small interface so it slots in later.
- **Replay mode (dev/demo essential):** feed a text file as a fake transcript at a chosen
  WPM, no mic or STT needed. This is how we develop and how we demo without a podium.

### 3.2 Transcript store

- Append-only list of finalized words with wall-clock timestamps.
- Derived views: sliding window of the last `windowWords` (default **250**, min for Pangram
  submission **80** — below that, skip the poll and show "warming up"), full-session text
  for export, words-per-minute over the last 60 s.

### 3.3 Detector engine

Pluggable interface; each detector emits `{ score: 0..1, label, confidence, detail, at }`.

**PangramDetector** (the headline act)
- Every `pollInterval` (default **20 s**), submit the current window: `POST /task` via
  relay → `task_id` → poll `GET /task/:id` every 1 s until `STAGE_SUCCESS`/`STAGE_FAILED`
  (timeout 15 s). Skip a cycle if the previous one is still in flight or the window text
  hasn't changed by ≥ 20 words.
- Score: `fraction_ai + 0.5 × fraction_ai_assisted`.
- Keep the per-window results: Pangram returns labeled sub-windows (`AI-Generated`,
  `Moderately AI-Assisted`, ...) with character offsets — used to tint transcript spans.
- Cost accounting on screen: each scan of ≤1000 words is 1 credit = **$0.05**; at 20 s
  cadence that's ~$9/hour of speech. Show a live credits-spent counter (satire about slop
  should be transparent about its own burn rate).
- Error handling: `402` → "out of credits" banner; `429` → back off, double interval;
  `STAGE_FAILED` → show reason, keep last good score.

**LexicalDetector** (free, continuous, funnier)
- Pure in-browser heuristic recomputed on every finalized segment over the same window:
  slop lexicon hits per 100 words ("delve", "tapestry", "testament to", "in today's
  fast-paced world", "it's not just X, it's Y", "let's dive in", "game-changer",
  "furthermore/moreover" density, list-of-three cadence), squashed through a logistic
  into 0..1. Lexicon lives in one editable JSON file — half the fun is tuning it.
- Runs with **no keys at all** → the app has a genuine free demo mode.

**Fusion → needle**
- The dial tracks a target value: by default `max(pangram, lexical × 0.9)` — Pangram sets
  the authoritative level; lexical wiggles the needle between polls. Config can pin the
  dial to a single detector.
- Needle physics: critically-damped spring toward the target with a little jitter
  proportional to live WPM, so it behaves like a real meter, not a slideshow.

### 3.4 UI

Single page, three states: **setup** (no keys yet → config front and center, replay-mode
offer), **live** (below), **error** (banner over live).

Live layout, dark theme, projector-friendly:
- **The dial** (~70% of viewport): SVG semicircular gauge, green → amber → red sweep,
  big needle, tick labels escalating from "ARTISANAL" through "FOCUS-GROUPED" to
  "PURE SLOP" (labels in one editable constants file). Current score as a large number,
  plus Pangram's own `headline` string under it ("AI Detected") when fresh.
- **Subtitle strip** (bottom): last ~2 lines, karaoke-style; interim words grey; once
  Pangram window results arrive, spans tint red/amber per its sub-window labels.
- **Diagnostics rail** (corner, toggle with `d`): WPM, session slop sparkline (score vs
  time), credits spent, STT status, last Pangram round-trip time.
- **Config dialog** (gear / `,`): Pangram key, STT backend selector (Deepgram key /
  Web Speech API / replay), relay URL (prefilled with the public deployment), mic picker,
  poll interval, window size, detector toggles & fusion mode, slop-label theme. Persisted to `localStorage`. Keyboard: `f` fullscreen, `space`
  pause/resume scoring, `r` replay mode.

### 3.5 Relay (Cloudflare Worker)

- Routes: `POST /task`, `GET /task/:id` → forward to `https://text.external-api.pangram.com`,
  pass `x-api-key` through, return response with `Access-Control-Allow-Origin: *` (+ handle
  `OPTIONS` preflight). No storage, no logging, no key of its own.
- Deployed free-tier via `wrangler`; repo includes `worker/` with a one-command deploy so
  anyone can run their own.

## 4. Repo layout

```
filibotster/
├── SPEC.md
├── README.md            # setup, key acquisition, cost table, honesty note
├── app/                 # Vite + vanilla TS SPA
│   ├── index.html
│   └── src/
│       ├── audio/       # mic capture, worklet, deepgram client, replay source
│       ├── transcript/  # store + windowing
│       ├── detectors/   # detector interface, pangram.ts, lexical.ts, fusion.ts
│       ├── ui/          # dial.ts (SVG), subtitles.ts, config.ts, diagnostics.ts
│       └── slop-lexicon.json
└── worker/              # Cloudflare Worker relay + wrangler.toml
```

## 5. Cost & latency budget (defaults)

| Stage | Latency | Cost |
|---|---|---|
| Mic → Deepgram final text | 0.5–2 s | ~$0.35/hr (user's key) |
| Mic → Web Speech API final text (fallback) | 1–3 s | free, lower accuracy |
| Window → Pangram verdict | 2–8 s round trip, every 20 s | ~$9/hr (user's key) |
| Lexical meter | < 16 ms, continuous | free |
| **Needle reflects speech from** | **~10–30 s ago (Pangram) / ~2 s (lexical)** | |

## 6. Milestones

1. **M1 — Needle moves, zero keys:** dial + subtitle UI, transcript store, lexical
   detector, replay mode. Fully demoable offline.
2. **M2 — Real ears:** Web Speech API path first (no key, fastest route to live audio),
   then the Deepgram capture path with mic picker and reconnect logic; config dialog with
   the STT backend selector and no-key → Web Speech fallback behavior.
3. **M3 — Pangram:** Worker relay deployed, PangramDetector, window tinting, credit
   counter, fusion. This is the shippable satire.
4. **M4 — Polish/stretch:** OBS-friendly transparent overlay mode, session export
   (transcript + score timeline as JSON/CSV), AssemblyAI backend, shareable
   post-speech report card, GPTZero/Sapling backends.

## 7. Risks & open questions

- **Short/rolling windows may confuse Pangram** — it's trained on documents. Mitigation:
  250-word windows, 80-word floor; if verdicts look degenerate in practice, grow the window
  or score the full running transcript instead (still 1 credit until 1000 words).
- **ASR text lacks the formatting slop-detectors feed on** (Deepgram's `smart_format`
  restores punctuation, which helps). Expect the needle to be conservative; the lexical
  meter compensates theatrically.
- **Venue audio**: podium feeds are often mixer outputs at line level; the mic picker plus
  a visible input-level meter in config guards against scoring silence.
- **Public relay abuse**: the Worker forwards only to Pangram and only with a caller's own
  key, so the abuse surface is small; free-tier rate limits are the backstop. Revisit if
  the public deployment gets traffic.
