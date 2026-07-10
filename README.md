# Filibotster

Live rhetorical slop telemetry for the modern podium. Point a microphone at a
speaker and project a giant vintage meter whose needle swings into the red as
their recent language reads as AI-generated slop.

See [SPEC.md](SPEC.md) for the full design. Current state: **M1** (dial,
subtitles, lexical slop meter, replay demo, Pangram client + relay) plus the
Web Speech API live-mic path pulled forward from M2.

## Quick start (no keys needed)

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
[Pangram](https://www.pangram.com) verdicts you need:

1. A Pangram API key (developer credits: $0.05 per scan of ≤1000 words —
   at the default 20 s cadence that's **~$9/hour of speech**; a live credit
   counter runs in diagnostics, `d`).
2. A relay, because Pangram's API doesn't allow browser CORS requests:

   ```sh
   cd worker
   npx wrangler deploy   # free Cloudflare account
   ```

3. Put the key and your relay URL into the config dialog (`,`).

Keys live in your browser's localStorage and are sent only to their respective
APIs; the Pangram key transits your relay in memory, unlogged.

## Honesty note

AI-text detectors are calibrated on written prose, not ASR transcripts of
speech. The needle is satire, not forensics. Tune the free detector to taste
in [app/src/slop-lexicon.json](app/src/slop-lexicon.json).
