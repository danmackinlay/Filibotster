# Filibotster

**Point a microphone at a speaker. Watch a giant vintage meter swing into the
red as their words start sounding AI-generated.**

[![The slop-o-meter reading 90, deep in PURE SLOP territory](docs/preview.webp)](https://filibotster.netlify.app/?demo=slop)

Filibotster listens to live speech, transcribes it, and continuously scores the
last minute or two for *slop* — the flat, hedging, delve-and-tapestry register
of machine-written prose. The score drives a full-screen analogue dial you can
project behind a podium, with subtitles running underneath.

### ▶ [Try it — no signup, no keys, no install](https://filibotster.netlify.app/?demo=slop)

That link plays a bundled demo speech that starts artisanal and decays into pure
slop. When you're bored of it, hit **● LIVE MIC** and point it at a real voice.

> **It's satire, not forensics.** AI-text detectors are calibrated on written
> prose, not on transcripts of people talking off the cuff. A high reading is a
> joke about someone's register, not evidence that a machine wrote their speech.
> Please don't use it to accuse anyone of anything.

## Do I need an API key?

No. It works out of the box. Keys make it work *better*, and you add them in the
app itself — press `s` for settings. They're stored only in your own browser.

| What you want | What you need | What you get |
| --- | --- | --- |
| **Just to see it** | nothing | Demo speech, dial, subtitles. Works in any browser. |
| **Live mic, free** | nothing | The browser's own speech recognition — **real Google Chrome only** (see below). |
| **Live mic, dependable** | a [Deepgram](https://console.deepgram.com) key | Accurate transcription in any modern browser, plus a microphone picker. |
| **A real AI detector** | a [Pangram](https://www.pangram.com) or [Sapling](https://sapling.ai) key | A commercial detector's verdict, instead of the free built-in word-spotting heuristic. |

**The Chrome caveat.** Free live-mic mode uses the browser's built-in Web Speech
API, which in practice means *real* Google Chrome. Chromium forks (Arc, Brave,
Edge…) expose the API but their recogniser fails with a network error —
Filibotster gives up and tells you so after a few tries. Safari and Firefox
don't have it at all. A Deepgram key sidesteps the whole mess.

**Without a detector key** the needle is driven by a free in-browser heuristic
that counts slop words and tics. It's crude, it's fun, and it costs nothing.
Tune its vocabulary in [app/src/slop-lexicon.json](app/src/slop-lexicon.json).

### What the keys cost

- **Deepgram** — speech-to-text. Sign up at
  [console.deepgram.com](https://console.deepgram.com): no card required, and
  new accounts get $200 of credit. Streaming runs about **$0.35/hour**, so that
  free credit is roughly 550 hours of speeches. Create a key with **Create API
  Key** and paste it into settings.
- **Sapling** — AI detection, the cheap option. Sign up at
  [sapling.ai](https://sapling.ai) and grab a key from the dashboard.
  About **$1.22/hour of speech** at default settings, no subscription floor. Its
  raw score is jumpier and less smoothed than Pangram's, which makes for a
  livelier needle.
- **Pangram** — AI detection, the strict option. Buy developer credits from your
  [pangram.com](https://www.pangram.com) dashboard
  ([pricing](https://www.pangram.com/pricing)). $0.05 per scan, which at the
  default 20-second cadence is about **$9/hour of speech** — a live credit
  counter runs in diagnostics (`d`).

Pick which detector to use in settings → *AI detector*. Comparison and methodology
notes live in [docs/research-commercial-detectors.md](docs/research-commercial-detectors.md).

### Where your keys go

Keys live in your browser's `localStorage` and are sent only to the API they
belong to. The one exception: Pangram's API blocks browser requests outright, so
Pangram calls pass through a tiny relay bundled with the site
([worker/src/index.js](worker/src/index.js)) which holds the key in memory,
logs nothing, and stores nothing. Sapling and Deepgram talk to the browser
directly. If you'd rather not take that on trust, run your own copy — it takes
about five minutes, see [Hosting your own](#hosting-your-own) — and point the
relay URL at it.

## Running it locally

```sh
cd app
npm install
npm run dev
```

Open the printed URL. No keys needed to get the demo running.

Keyboard: `s` settings · `f` fullscreen · `space` pause · `d` diagnostics · `r` replay.
Add `?demo` to the URL to auto-start the replay, or `?demo=slop` to start it
already deep in the red (handy for screenshots and instant gratification).

## Hosting your own

A static site plus one small serverless relay on the same origin. Two supported
targets; both free tiers are more than enough.

### Netlify (what the public instance runs on)

[netlify.toml](netlify.toml) builds the app and
[netlify/functions/task.mjs](netlify/functions/task.mjs) serves the relay at
`/task` on the same origin — no other config.

1. Push this repo to GitHub (or GitLab etc.).
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
   Build settings are read from `netlify.toml`; change nothing, deploy.
3. Optional custom domain: **Domain management → Add a domain**. If your DNS is
   already on Netlify this is instant, certificate included.

No-git alternative: `npx netlify-cli deploy --prod` from the repo root.

### Cloudflare Workers

One Worker serves the app as static assets and relays `/task`
([worker/wrangler.toml](worker/wrangler.toml)).

1. Free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up);
   skip adding a domain.
2. `npm install` (repo root), then `npx wrangler login`.
3. `npm run deploy`. The first deploy asks you to claim an account-wide
   `*.workers.dev` subdomain — pick something generic (your name, not this
   project's), since every future Worker of yours lives under it:
   `filibotster.<your-subdomain>.workers.dev`.
4. Custom domains require the domain's zone to be on Cloudflare — see the
   commented `routes` block in `worker/wrangler.toml`.

## Spread the slop

A printable A4 flier with a QR code pointing at the public instance, for leaving
on conference tables and taping to podiums: **[flier.pdf](docs/flier.pdf)**.
Source is [docs/flier.html](docs/flier.html) — edit and re-render with headless
Chrome (`--print-to-pdf`) if the URL or the jokes ever change.

[<img src="docs/flier.webp" alt="Filibotster flier: a cream meter-face poster with QR code linking to filibotster.netlify.app" width="360">](docs/flier.pdf)

## Under the hood

Everything runs in the browser — mic capture, transcription, scoring, the dial —
except the Pangram relay. Vanilla TypeScript and Vite, no framework.
[SPEC.md](SPEC.md) has the full design: architecture, why the relay exists, the
trust model, and the detector-fusion maths.

MIT licensed. See [LICENSE](LICENSE).

---

*A nag from the [Dan MacKinlay Stable of Variably Well-Considered
Enterprises](https://danmackinlay.name).*
