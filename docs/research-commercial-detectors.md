# Commercial AI-text-detection APIs: alternatives/supplements to Pangram

*Research date: 2026-07-10. All docs fetched live; CORS results verified with `curl` OPTIONS preflights on this date.*

## Context

Filibotster drives a live slop-o-meter dial from a Deepgram ASR transcript: a ~250-word
sliding window (~1,300–1,500 chars, informal spoken register, approximate punctuation, no
formatting) re-scored every ~20 s during a speech — i.e. **3 scans/min, 180 scans/hr, ≈45,000
words/hr, ≈245,000 chars/hr**. Current detector is Pangram v3 (async task API, $0.05 per
≤1,000-word scan → **$9.00/hr** at our cadence), which is deliberately tuned for near-zero
false positives and therefore reads as "too conservative" — the dial barely moves on
AI-flavoured spoken text. We want a **continuous, better-calibrated (jumpier) score**, cheap
repeated small scans, and ideally direct browser access (BYO key in localStorage) without a
relay.

A note on "permissive": the independent UChicago Booth study (WP 2025-116) confirms Pangram
is the FPR-minimizing outlier — essentially 0% false positives. For a satirical dial that is
the *wrong* operating point; detectors that sit near 1–3% FPR on short passages (GPTZero,
Originality) or expose raw probabilities (Sapling) will move the needle far more readily on
borderline transcript text.

## Comparison table

| | **Sapling** | **GPTZero** | **Winston AI** | **Copyleaks** | **Originality.ai** | *(Pangram, current)* |
|---|---|---|---|---|---|---|
| Endpoint | `POST https://api.sapling.ai/api/v1/aidetect` | `POST https://api.gptzero.me/v2/predict/text` | `POST https://api.gowinston.ai/v2/ai-content-detection` | `POST https://api.copyleaks.com/v2/writer-detector/{scanId}/check` | `POST https://api.originality.ai/api/v3/scan` | `POST /task` + poll `GET /task/{id}` |
| Auth | `key` in JSON body (or `Authorization: Bearer`) | `x-api-key` header | `Authorization: Bearer` | 2-step: email+key → 48 h bearer token | `X-OAI-API-KEY` header | `x-api-key` header |
| Sync/async | **Sync** | **Sync** | **Sync** | **Sync** (token step is separate) | **Sync** | Async task + poll |
| Continuous score | ✅ `score` 0–1 (P(AI)) + per-sentence scores + **per-token probs** | ✅ `average_generated_prob` 0–1, `class_probabilities` {human, ai, mixed}, per-sentence probs | ✅ `score` 0–100 (human score; invert) + per-sentence scores | ⚠️ Mostly categorical: per-section `classification` + `probability`; `summary.ai` is a 0–1 AI **proportion**, tends to saturate at 0/1 | ✅ `ai.score` (P(fake) 0–1) + per-block `fake`/`real` probs | fraction_ai etc. (well-calibrated but conservative) |
| Min / max length | Recommended ≥300 chars; max 200k chars | No documented min; truncates at 50k chars (150k on top plan) | **Min 300 chars, warns <600 chars unreliable**; max 150k chars | **Min 255 chars**; max 100k chars | No hard documented min (plain text advised) | 80 words (our `MIN_WORDS`) |
| Fits 250-word window (~1.3k chars)? | ✅ comfortably | ✅ | ✅ (above both thresholds) | ✅ | ✅ | ✅ |
| Pricing | **$0.005 / 1k chars** (metered, first 10M chars/mo) | $45/mo for 300k words; overage $150/M words (≈$0.15/1k words) | 1 credit/word; $16/mo (annual) = 200k credits | 1 credit = 250 words; Personal $13.99/mo = 1,200 credits — **but API access is Enterprise/contact-sales** | 1 credit = 100 words; **API requires Enterprise plan $136.58/mo** (15k credits) | $0.05/scan |
| **$/hr at our cadence** | **≈$1.22/hr** | **≈$6.75/hr** ($45 plan ≈ 6.7 speech-hours) | **≈$3.60/hr** (Advanced annual) | ≈$2.10/hr in credits (if API were accessible) | ≈$4.90/hr in credits + $137/mo floor | **$9.00/hr** |
| Free tier / trial | 1-month Pro trial; API metered from $0 (pay for use) | 10k words/mo free web plan (API key requires paid plan for production) | 2,000 credits / 14 days (≈8 of our scans) | **Sandbox mode free** (mock results); some free credits on signup | None meaningful for API | Free credits on signup |
| Rate limits | Not published (contact to throttle) | Not published; quota-metered by words | "Unlimited scans/hour" (plans); 429 on abuse | Not published for this endpoint; 429 documented | **500 req/min** | Generous |
| **Browser CORS (tested)** | ✅ **`Access-Control-Allow-Origin: *`**, allows `Content-Type, Authorization` | ✅ **Echoes Origin**, allows any requested headers incl. `x-api-key` | ❌ OPTIONS → 404, no ACA-* headers → relay required | ❌ 204 but **no ACA-* headers** (both `api.` and `id.` hosts) → relay required | ✅ **`*`**, allows requested headers incl. `X-OAI-API-KEY` | ❌ (why the relay exists) |
| Calibration notes (Booth WP 2025-116 / vendor) | Not in Booth study; raw sentence/token probabilities, vendor explicitly warns of FPs — least "verdict-smoothed" of the lot | FPR ≤1% medium/long, up to ~2.4% short passages; multi-class output; vendor claims <1% FPR | Not independently benchmarked (vendor "99.98%" claim is marketing); low-rigor third-party reviews only | Vendor claims ~0.2% FPR (unverified); `sensitivity` 1–3 knob adjusts aggressiveness | FPR ≤1% medium/long, ~2–3% short; "close second" to Pangram; model choice `lite` (<1% FP) vs `turbo` (<5% FP, most aggressive) = built-in permissiveness knob | Essentially 0% FPR — the strictest; the reason it's boring |
| ToS / BYO-key red flags | Key normally sent in body — fine for user's own key; no browser prohibition found | API docs are public; privacy policy says API documents are not stored | Bearer key exposed via relay only; nothing unusual | API gated behind Enterprise sales; email+API-key login flow means the browser would hold **both** email and key, and mint 48 h tokens — ugly for BYO-key | **Auto credit top-up is ON by default** (surprise card charges for users); Enterprise-only API is a hard gate for casual BYO users | — |

Sources: see [Sources](#sources) below. CORS column from live `curl -X OPTIONS` preflights
(Origin `https://example.com`, request-method POST, request-headers
`content-type,authorization,x-api-key,x-oai-api-key`), 2026-07-10.

## Per-provider detail

### Sapling AI Detector
- `POST https://api.sapling.ai/api/v1/aidetect`, JSON `{ key, text, sent_scores?, score_string?, version? }`.
  Response: `score` (0–1 P(AI)), `sentence_scores[] {sentence, score}`, `tokens[]` +
  `token_probs[]` for heat-mapping. Versioned models (`20251027` current).
- English-only for the detector. Recommended ≥300 chars. 200k char max.
- Pricing is pure metered usage: $0.005 per 1,000 chars (≤10M chars/mo), no subscription
  floor. Our cadence ≈ 245k chars/hr ≈ **$1.22 per speech-hour** — 7× cheaper than Pangram.
  AI-detect results are cached by full-text hash for 3 days (identical window re-scans are
  free; our sliding window rarely repeats exactly, so budget as uncached).
- CORS preflight returns `Access-Control-Allow-Origin: *` and allows
  `Content-Type`/`Authorization` — and since the key can travel in the JSON body, a direct
  browser POST works with no relay at all.
- Docs are refreshingly honest about false positives/negatives and offer per-use-case tuning
  on request. The raw per-token probabilities are exactly the "dial, not verdict" shape we
  want; community experience is that Sapling scores are notably jumpier (more permissive)
  than Pangram's.

### GPTZero
- `POST https://api.gptzero.me/v2/predict/text`, header `x-api-key`, body
  `{ document, multilingual?, modelVersion?, apiVersion? }`. Response per document:
  `average_generated_prob` (0–1), `class_probabilities` {human/ai/mixed},
  `predicted_class`, `confidence_category` (high/medium/low), `document_classification`
  (HUMAN_ONLY/MIXED/AI_ONLY), and per-sentence `generated_prob` with highlight flags —
  a rich continuous surface. `subclass` even distinguishes `pure_ai` vs `ai_paraphrased`.
- Truncates at 50k chars. No documented minimum; vendor notes it "performs best on longer
  texts and English prose" — expect noisier scores on 250-word ASR windows (noise is
  arguably a feature for a dial).
- API pricing: $45/mo = 300k words, then $150/M words. Our cadence burns the base plan in
  ~6.7 speech-hours → effective **≈$6.75/hr**. SOC 2; API inputs not stored.
- CORS preflight: allows origin echo + arbitrary headers incl. `x-api-key` →
  **works browser-direct, no relay**.
- Calibration: Booth study puts FPR ≤1% medium/long, ≤~2.4% short — meaningfully more
  trigger-happy than Pangram, which for our purposes means a livelier dial. GPTZero
  publicly disputes Booth's ranking (they argue `class_probabilities` should be used, not
  `average_generated_prob`) — for us the takeaway is: read `class_probabilities.ai`
  + `0.5 × class_probabilities.mixed` for a Pangram-comparable blend, or
  `average_generated_prob` for the raw (jumpier) signal.

### Winston AI
- `POST https://api.gowinston.ai/v2/ai-content-detection`, `Authorization: Bearer`,
  body `{ text, version?, sentences?, language? }`. Response: `score` 0–100 **human** score
  (dial score = `1 - score/100`), `sentences[] {text, score}`, `credits_used`.
- Min 300 chars, docs warn results below 600 chars are unreliable — our ~1,300-char window
  clears both, but the warning suggests short-text calibration is weak.
- 1 credit/word. Advanced plan $16/mo (annual) = 200k credits → **≈$3.60 per speech-hour**
  (one hour of speech ≈ a quarter of the monthly quota). Free trial: 2,000 credits ≈ 8 scans.
- CORS: OPTIONS returns 404 with no CORS headers → **relay required**.
- No credible third-party calibration data (the "99.98% accuracy" figure is marketing).

### Copyleaks AI Detector
- Two-step: `POST https://id.copyleaks.com/v3/account/login/api` with `{email, key}` → 48 h
  bearer token, then `POST https://api.copyleaks.com/v2/writer-detector/{scanId}/check` with
  `{ text, sandbox?, explain?, sensitivity? (1–3) }`. Sync response: per-section
  `classification`/`probability` + `summary {human, ai}` (proportion of text judged AI).
- Min 255 chars, max 100k. Free sandbox mode returns mock results (useful for integration
  tests only). `sensitivity` 1–3 is a real permissiveness knob.
- The score shape is the weakest for a dial: `summary.ai` is a coverage fraction that tends
  to sit at 0.0 or 1.0 for a homogeneous 250-word window, not a graded probability.
- Pricing: consumer plans (1 credit = 250 words; Personal $13.99/mo annual = 1,200 credits →
  ≈$2.10/hr) but the pricing FAQ states **API access requires Enterprise/contact-sales**.
- CORS: no ACA-* headers on either host → relay required — and the login flow means the
  browser (or relay) must handle the user's email + key and token caching. Worst BYO-key fit.

### Originality.ai
- `POST https://api.originality.ai/api/v3/scan`, header `X-OAI-API-KEY`, body
  `{ content, title, check_ai: true, check_plagiarism: false, …, aiModelVersion: "lite"|"turbo"|"multilang", storeScan }`.
  Sync response: `results.ai.score` {fake, real} 0–1 plus per-block scores — good continuous shape.
- Model choice is an explicit calibration knob: `lite` (<1% FP, tolerant of light AI editing)
  vs `turbo` (<5% FP, most aggressive detector — the *most permissive-toward-flagging* option
  surveyed). Booth ranks Originality a close second to Pangram on FPR (i.e. still fairly
  strict in `lite`; `turbo` moves the needle).
- Rate limit 500 req/min (documented). 1 credit = 100 words → 250-word scan = 3 credits.
- **Gates**: API requires the Enterprise plan ($136.58/mo annual, 15k credits ≈ 27 speech-
  hours → ≈$4.90/hr marginal), and accounts default to **auto credit top-up** on the stored
  card — a genuine ToS/billing red flag for casual BYO-key users.
- CORS: preflight returns `Access-Control-Allow-Origin: *` → browser-direct works
  (a Cloudflare-fronted PHP API that happily reflects allow-headers).

### Also looked at
- **Grammarly AI Detection API (beta)**: org-level OAuth 2.0, file-upload + pre-signed S3 +
  poll workflow, min 30 words, returns `ai_generated_percentage` + `average_confidence`.
  Continuous, but the 3-request async file dance and organization OAuth make it a non-starter
  for a BYO-key browser toy. Skipped from the table.
- **ZeroGPT / It's AI / smaller detectors**: either no public self-serve API, no published
  pricing, or no credible calibration evidence; skipped per task scope.

## Recommendation

**Primary: Sapling.**
- Cheapest by far (**≈$1.22/hr vs Pangram's $9.00/hr**), pure metered billing with no
  subscription floor — ideal for a toy that runs in bursts.
- Sync single POST; **no relay needed** (verified `Access-Control-Allow-Origin: *`, key in
  request body) — the integration is a plain `fetch` from the SPA.
- Returns exactly the dial-friendly shape: document probability + sentence scores + token
  probabilities, with no verdict smoothing. Sapling explicitly does not optimize for
  near-zero FPR the way Pangram does, so borderline spoken text will actually move the meter.
- English-only and ≥300-char recommendation both fit our use case.
- Risk: no independent Booth-style benchmark; treat its absolute calibration as unknown and
  present it as a second opinion next to Pangram (the app already has a lexical/Pangram dual
  source model, so a third `source` is natural).

**Runner-up: GPTZero.**
- Also browser-direct (CORS verified), sync, and the richest response schema
  (`class_probabilities`, sentence probs, mixed-class, paraphrase subclass). Independently
  characterized calibration (FPR ≤1–2.4%) that is provably more permissive than Pangram.
- Costs ~5.5× Sapling (**≈$6.75/hr**, $45/mo minimum commitment) — fine for a demo, worse for
  BYO-key users who must buy a $45/mo dev plan.

Winston is a reasonable third (cheap-ish, clean scores) but needs a relay route and has no
calibration evidence. Copyleaks and Originality are poor BYO-key fits (enterprise-gated
APIs; Copyleaks' email+key token flow; Originality's default auto top-up).

## Integration sketch

### Detector interface (`app/src/detectors/types.ts`)

Widen the source union and keep `DetectorResult` as-is — both candidates map cleanly:

```ts
export interface DetectorResult {
  score: number                     // 0..1 slop
  source: 'lexical' | 'pangram' | 'sapling' | 'gptzero'
  label: string
  detail?: string
  confidence?: string
  at: number
}
```

### Sapling client (`app/src/detectors/sapling.ts`, mirrors `pangram.ts` but simpler)

```ts
export class SaplingClient {
  constructor(private getApiKey: () => string) {}

  async scan(text: string): Promise<DetectorResult & { sentences: ScoredWindow[] }> {
    const res = await fetch('https://api.sapling.ai/api/v1/aidetect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: this.getApiKey(), text, sent_scores: true }),
    })
    if (!res.ok) throw new SaplingError(res.status)
    const body = await res.json() // { score, sentence_scores[], tokens[], token_probs[] }
    return {
      score: body.score,                       // already 0..1 P(AI) — no blending needed
      source: 'sapling',
      label: labelFor(body.score),
      at: Date.now(),
      sentences: (body.sentence_scores ?? []).map(toScoredWindow(text)), // indexOf-based start/end
      // token_probs available for transcript tinting at finer grain than Pangram windows
    }
  }
}
```

Notes: no polling loop, no relay URL setting, no task IDs. `ScoredWindow.startIndex/endIndex`
must be computed via `text.indexOf(sentence, cursor)` since Sapling returns sentences, not
offsets. Error mapping: 401 invalid key, 402/`license` headers → out of quota
(`X-Sapling-License-*` response headers are exposed via `Access-Control-Expose-Headers`), 429
rate limit.

GPTZero would be near-identical: direct `fetch` with `x-api-key`, score =
`docs[0].class_probabilities.ai + 0.5 * class_probabilities.mixed` (mirroring the existing
Pangram blend), sentence highlights from `documents[0].sentences[].generated_prob`.

### Relay strategy

- **Sapling / GPTZero / Originality: no relay.** Verified preflights pass browser-direct.
  This *removes* infrastructure per provider rather than adding it.
- **Keep the existing worker exactly as-is for Pangram.**
- **If Winston (or Copyleaks) is ever added**, extend the relay to per-provider path prefixes
  rather than one generic passthrough — an open `?url=` style generic relay is an abuse
  magnet. Concretely, in `worker/src/index.js`: map `/pangram/task*` →
  `text.external-api.pangram.com`, `/winston/v2/ai-content-detection` →
  `api.gowinston.ai` (forwarding `Authorization` instead of `x-api-key`), each with its own
  allowlisted method+path regex, sharing the CORS header block. ~20 extra lines per provider,
  duplicated in `netlify/functions/task.mjs`.

### Effort estimates

| Task | Effort |
|---|---|
| Sapling client + config UI (key field) + wire into scan scheduler + labelFor reuse | ~0.5 day |
| Sentence→ScoredWindow mapping for transcript tinting (Sapling/GPTZero) | ~0.25 day |
| GPTZero client (if added as second option / A-B toggle) | ~0.5 day |
| Detector-select dropdown (pangram / sapling / gptzero) + per-detector cost meter (`CREDIT_USD` → per-provider cost fn) | ~0.5 day |
| Winston relay routes (worker + netlify) + client, only if pursued | ~1 day |
| Copyleaks (token flow, relay, enterprise sales) | not recommended (~2 days + sales cycle) |

## Sources

- Sapling AI Detector API docs — https://sapling.ai/docs/api/detector/
- Sapling API pricing — https://sapling.ai/docs/api/pricing/ (AI Detector tab)
- Sapling plans — https://sapling.ai/pricing
- GPTZero API reference (predict/text) — https://gptzero.stoplight.io/docs/gptzero-api/7u1d145aq2e52-ai-detection-on-a-single-string
- GPTZero developer/API pricing — https://gptzero.me/developers
- GPTZero consumer pricing — https://gptzero.me/pricing
- GPTZero response to Booth study — https://gptzero.me/news/chicago-booth-2026/
- Winston AI detection endpoint — https://docs.gowinston.ai/api-reference/v2/ai-content-detection/post
- Winston AI pricing — https://gowinston.ai/pricing/
- Copyleaks AI text detection guide — https://docs.copyleaks.com/guides/ai-detector/ai-text-detection
- Copyleaks writer-detector/check reference — https://docs.copyleaks.com/reference/actions/writer-detector/check
- Copyleaks pricing (incl. "API access = enterprise" FAQ) — https://copyleaks.com/pricing
- Originality.ai API docs (v3 scan, rate limit, auto top-up, model versions) — https://docs.originality.ai/originality-ai-api-v1
- Originality.ai pricing — https://originality.ai/pricing
- Grammarly AI Detection API (beta) — https://developer.grammarly.com/ai-detection-api.html
- UChicago Booth WP 2025-116, "Artificial Writing and Automated Detection" (Jabarian & Imas) — https://bfi.uchicago.edu/wp-content/uploads/2025/09/BFI_WP_2025-116.pdf
- FPR comparison synthesis (Booth + Liang et al. 2023) — https://gradpilot.com/news/ai-detector-false-positive-rates-compared
- Pangram on false positives (first-party) — https://www.pangram.com/blog/all-about-false-positives-in-ai-detectors
- RAID benchmark paper — https://arxiv.org/html/2405.07940v1
- CORS results: live `curl -si -X OPTIONS <endpoint> -H "Origin: https://example.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization,x-api-key,x-oai-api-key"`, 2026-07-10.
