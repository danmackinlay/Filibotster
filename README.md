# Filibotster

Live rhetorical slop telemetry for the modern podium. Point a microphone at a
speaker and project a giant vintage meter whose needle swings into the red as
their recent language reads as AI-generated slop.

**Public instance:** `https://filibotster.YOUR-SUBDOMAIN.workers.dev`
<!-- TODO: replace with the real URL after first `npm run deploy` -->

See [SPEC.md](SPEC.md) for the full design. Current state: **M1** (dial,
subtitles, lexical slop meter, replay demo, Pangram client + relay) plus the
Web Speech API live-mic path pulled forward from M2.

## Quick start (local, no keys needed)

```sh
cd app
npm install
npm run dev
```

Open the printed URL, hit **▶ REPLAY DEMO**, and watch the bundled demo speech
decay from artisanal to pure slop. **● LIVE MIC** uses your browser's built-in
speech recognition (Chrome recommended) — still no keys.

Keyboard: `f` fullscreen · `space` pause · `d` diagnostics · `r` replay · `,` config.

## Pangram (the real detector)

The lexical meter is a free heuristic. For actual
[Pangram](https://www.pangram.com) verdicts, put a Pangram API key into the
config dialog (`,`). Developer credits cost $0.05 per scan of ≤1000 words — at
the default 20 s cadence that's **~$9/hour of speech**; a live credit counter
runs in diagnostics (`d`).

Pangram's API blocks browser CORS requests, so calls go through a tiny relay
([worker/src/index.js](worker/src/index.js)). On the hosted instance the relay
is the same site that serves the app, so the relay URL field stays empty.
Keys live in your browser's localStorage and are sent only to their respective
APIs; the Pangram key transits the relay in memory, unlogged. Distrustful?
Deploy your own instance (below, ~5 minutes) and point the relay URL at it.

## Hosting your own

The whole deployment is one Cloudflare Worker: it serves the static app and
relays `/task` requests to Pangram. Everything fits in Cloudflare's free tier
(100k requests/day, no card required).

One-time setup:

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up)
   — the free plan is fine; skip adding a domain.
2. `npm install` (repo root — pulls in `wrangler`, Cloudflare's CLI).
3. `npx wrangler login` — opens a browser OAuth flow.

Then, for every release:

```sh
npm run deploy
```

The first deploy asks you to pick a `*.workers.dev` subdomain; the app is then
live at `https://filibotster.<your-subdomain>.workers.dev`. Update the
"Public instance" link at the top of this file with the real URL. A custom
domain can be attached later in the Cloudflare dashboard (Workers → your
worker → Domains & Routes) if the workers.dev URL is too honest about how this
was made.

## Honesty note

AI-text detectors are calibrated on written prose, not ASR transcripts of
speech. The needle is satire, not forensics. Tune the free detector to taste
in [app/src/slop-lexicon.json](app/src/slop-lexicon.json).
