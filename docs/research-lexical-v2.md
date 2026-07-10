# Lexical Detector v2 — Research & Design Spec

Status: proposal, ready to implement.
Scope: `app/src/detectors/lexical.ts` + `app/src/slop-lexicon.json` (v2 supersedes both; new file `app/src/detectors/lexical2.ts` or in-place rewrite, maintainer's choice).
Audience: the maintainer. Written to be implemented from directly.

## 0. Problem statement

The current lexical detector counts slop-phrase hits per 100 words and squashes through a logistic (`K=1.4`, midpoint 2.2 hits/100w). That is one feature. It is spiky (a single "robust" from a human speaker moves the dial), topic-biased (any business-speak pegs it), and blind to the *structural* tells of LLM prose: metronomic sentence rhythm, connective-tissue density, parallelism cadence, absence of human speech mess.

v2 keeps the lexicon as one feature among ~7, all computable in-browser in O(n) over a ≤1000-word window, no network, no language model, robust to ASR transcription (approximate punctuation, unreliable case, no formatting, disfluencies present).

Design goal restated from the project brief: a lively, continuous, roughly-monotone-in-sloppiness 0..1 signal that is *permissive where Pangram is conservative* — it should light up for AI-flavored speech even when a document-calibrated classifier wouldn't — and every feature should be fun to explain on the About page.

## 1. What the literature says (with numbers)

### 1.1 Burstiness / sentence-length uniformity

Humans vary sentence length a lot; LLMs are metronomic. This is the core of GPTZero's "burstiness" signal (their version fluctuates sentence-level perplexity; the perplexity-free version below uses lengths only).

**Concrete numbers.** Tarım & Onan (2025) define burstiness as the **coefficient of variation of sentence lengths (CV = σ/μ)** and measure, on 2,000 samples:

| Text source | Sentence-length CV (mean, SD) |
|---|---|
| Human originals | **0.334** (0.110) |
| LLaMA (autoregressive LLM) | 0.244–0.307 depending on task |
| LLaDA (diffusion LM) | 0.184–0.251 |

Differences human-vs-LLM significant at p < 0.001. Source: İ. Tarım, A. Onan, "Can You Detect the Difference?", arXiv:2507.10475, <https://arxiv.org/html/2507.10475v1> (Table of stylometric metrics; burstiness defined as "Coefficient of variation of sentence lengths (std/mean)").

Muñoz-Ortiz et al. (2024) similarly find "human texts exhibit more scattered sentence length distributions" across six LLMs vs human news text. Source: <https://link.springer.com/article/10.1007/s10462-024-10903-2> (Artificial Intelligence Review, "Contrasting Linguistic Patterns in Human and LLM-Generated News Text").

Caveat, honestly noted: Pangram argues perplexity/burstiness alone are weak detectors (<https://www.pangram.com/blog/why-perplexity-and-burstiness-fail-to-detect-ai>). Correct for a forensic classifier; fine for us — we want a continuous vibe meter, and burstiness is one of several features, not the verdict.

**Speech twist.** Spontaneous human speech is *even burstier* than human writing (fragments, one-word utterances, run-ons), so the human/LLM gap should widen on transcripts. But ASR "sentences" are approximate — see §2.1 for segmentation strategy.

- **Formula:** `CV = stddev(lengths) / mean(lengths)` over segment lengths in words.
- **Working thresholds:** CV ≥ 0.45 → fully human-ish (subscore 0); CV ≤ 0.20 → fully robotic (subscore 1); logistic between, midpoint ≈ 0.32.
- A **Fano factor** (σ²/μ) variant is possible but CV is what the literature reports; stick with CV so our numbers are comparable.

### 1.2 Lexical diversity: MTLD and MATTR

Plain TTR (types/tokens) collapses with window length — useless for a sliding window that varies 50–1000 words. Two standard length-robust variants:

- **MATTR** (Moving-Average TTR; Covington & McFall 2010, *J. Quantitative Linguistics* 17(2), <https://doi.org/10.1080/09296171003643098>): mean TTR over every sliding sub-window of fixed size W (use **W = 50**). O(n) with an incremental type counter.
- **MTLD** (McCarthy & Jarvis 2010, *Behavior Research Methods* 42, <https://doi.org/10.3758/BRM.42.2.381>): mean length of sequential runs ("factors") that keep TTR above **0.72**; computed forward and backward, averaged. Validated as length-independent for texts ≥ ~100 tokens.

**Direction of the signal — important and counterintuitive.** For *speech*, higher diversity is the AI tell. Spontaneous human speech is repetitive (fillers, restarts, favorite words); LLM output is diversity-inflated by repetition penalties and "elegant variation". Evidence:

- Wikipedia's Signs of AI writing has a whole section on LLM elegant variation driven by repetition penalty (<https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing>, § "Lexical diversity/elegant variation").
- EFL study: "ChatGPT-generated essays demonstrated greater lexical diversity, higher syntactic complexity, more nominalization" (<https://www.sciencedirect.com/science/article/pii/S2666799124000236>).
- Herbold et al. 2023 (*Scientific Reports*, <https://www.nature.com/articles/s41598-023-45644-9>) find ChatGPT essays stylistically distinct on similar dimensions (more nominalizations, denser style).

(For *written* text some studies find the opposite on plain TTR — e.g. Tarım & Onan report LLaMA TTR 0.883 > human — direction depends on genre and metric. Because our human baseline is *speech*, treat unusually high MATTR as slop and calibrate on transcripts, §5.)

- **Working numbers:** conversational human speech MATTR(50) typically ≈ 0.62–0.74; polished LLM prose ≈ 0.78–0.88. Midpoint ≈ 0.76. These are priors to be confirmed in calibration (§5) — the literature reports MATTR mostly for written corpora.
- Use **MATTR as the primary** (simpler, incremental, stable at 100–250 words); MTLD optional/nice-to-have for the About page ("we compute your MTLD live" is funnier).

### 1.3 Formulaic parallelism: rule of three, negative parallelism

Wikipedia's WikiProject AI Cleanup documents these as among the most reliable tells (<https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing>):

- **Negative parallelism** (§ "Negative parallelisms", shortcut WP:AIPARALLEL): "not only X but also Y", "It's not just X, it's Y", "This isn't X — it's Y", "not X, but Y", "X rather than Y" (the last especially in Grok output).
- **Rule of three** (§ "Rule of three", WP:RO3): "adjective, adjective, adjective" and "short phrase, short phrase, and short phrase" triads used to make superficial analyses look comprehensive.
- **Copula avoidance** (§ "Avoidance of basic copulatives"): "serves as", "stands as", "marks a", "represents a", "boasts a" instead of "is/has". One study documented a >10% drop in "is/are" usage in 2023 academic writing.

**Detectability without reliable punctuation:** yes, because the anchors are *lexical*, not punctuational:

- "not only … but (also)" — pure word anchor, survives any transcription.
- "it's not (just) X it's Y" — anchor on the repeated "it's not … it's" frame; make the comma/semicolon optional in the regex (current lexicon *requires* `[,;]` — bug for ASR; fix).
- Rule of three: with Deepgram `smart_format` commas are decent, so `\w+, \w+,? and \w+` works most of the time; add a comma-free fallback that anchors on ", and" rhythm being absent: detecting `A B and C` bare triads without punctuation over-fires badly, so **only count comma-marked triads and X-comma "X, Y, and Z" with the serial-and** — weight modestly, accept misses on Web Speech API (which emits little punctuation). Feature degrades gracefully to 0, never to noise.
- Copula-avoidance frames "serves as a", "stands as a", "is a testament to", "plays a pivotal/crucial/vital role" — pure lexical anchors, transcription-proof.

### 1.4 Discourse-marker & hedging density; sentence-opener monotony

LLMs lean hard on formal connectives and canned hedges; extemporaneous speakers say "so", "and", "but", "look", "well". Reinhart et al. (PNAS 2025, "Do LLMs write like humans?", <https://www.pnas.org/doi/10.1073/pnas.2422455122>, preprint <https://arxiv.org/html/2410.16107v1>) show instruction-tuned LLMs dramatically overuse present participial clauses ("…, highlighting the importance of…", "…, underscoring…") and nominalizations relative to matched human text — participial-clause rates run several times human rates in their corpus comparison. The participial tail ("comma + -ing verb + abstract object") is a strong, transcription-friendly frame: `, (highlighting|underscoring|emphasizing|showcasing|reflecting|demonstrating|ensuring|fostering) (the|its|their|a|how)`.

Two cheap sub-features:

1. **Connective/hedge rate**: hits per 100 words from a closed list: *furthermore, moreover, additionally, notably, importantly, crucially, significantly, in conclusion, in summary, overall, ultimately, in essence, it's important to note, it's worth noting, that being said, with that said, at its core, when it comes to, in the realm of, in today's world*. Human extemporaneous rate ≈ 0–1/100w; LLM keynote prose ≈ 2–5/100w (calibrate).
2. **Sentence-opener monotony**: over the window's segments, fraction opening with {additionally, furthermore, moreover, however, this, these, it is, in, by, with, as} minus fraction opening with human openers {so, and, but, well, i, you know, look, okay, now, yeah}. LLMs also *never* start with "And"/"So"; debate humans do constantly. Also compute opener repetition: `1 - uniqueOpeners/segments` (LLMs recycle "This…", "The…").

**Function-word distribution monotony** (the classic stylometry angle — function words are topic-independent): full χ²/JS-divergence against a reference distribution is possible but hard to calibrate per-speaker. Cheaper proxy with the same flavor, used by v2: **pronoun & contraction rates**. Spontaneous human speech is dense in *I, you, we, me, my* and contractions (*don't, it's, gonna, kinda*); LLM formal prose suppresses both (Muñoz-Ortiz et al. 2024 report pronoun and POS distribution differences; every "humanize AI text" guide tells you to add contractions back). These act as **humanity credits** (negative features).

### 1.5 Disfluencies — the anti-slop signal

The single most transcription-*native* feature: fillers and repairs. *um, uh, you know, i mean, sort of, kind of, like* (as filler), word-doubling ("the the", "I I think"). LLMs generating a speech produce ~zero; humans produce 2–6 per 100 words in spontaneous speech (Shriberg's classic disfluency work puts disfluency rates around 5–6 per 100 words in conversation).

**Config caveat:** Deepgram does **not** transcribe "um/uh" unless `filler_words=true` is set (<https://developers.deepgram.com/docs/filler-words>). v2 should recommend enabling it; the feature must also survive its absence ("you know", "i mean", repeats still come through). Web Speech API generally passes fillers through inconsistently. So: treat disfluency as a credit that *lowers* the score when present, never a penalty when absent, and cap its influence.

### 1.6 AI-vocabulary lists — sources for the expanded lexicon

| Source | What it gives | Size | License |
|---|---|---|---|
| **Kobak et al., "Delving into LLM-assisted writing in biomedical publications through excess vocabulary"** (Science Advances 2025, <https://www.science.org/doi/10.1126/sciadv.adt3813>; arXiv:2406.07016). Repo: <https://github.com/berenslab/llm-excess-vocab>, `results/excess_words.csv` | 900 "excess words" (excess-mortality-style year-over-year frequency analysis of 15M PubMed abstracts), annotated; **407 tagged `style`** — the gold list (accentuates, bolstering, delve(s/d/ing), elucidate, encompassing, garnered, harnessing, pivotal, underscores, …) | 407 style words | **MIT** — can vendor directly |
| **Juzek & Ward, "Why Does ChatGPT 'Delve' So Much?"** (COLING 2025, <https://aclanthology.org/2025.coling-main.426/>; arXiv:2412.11385, CC BY-SA 4.0) | 21 rigorously-identified "focal words" (delve, intricate, underscore, boast, garner, interplay, meticulous, pivotal, showcase, tapestry, testament, vibrant, …); evidence RLHF is the likely cause — great About-page material | 21 words | paper CC BY-SA 4.0; word lists are facts |
| **Wikipedia:Signs of AI writing** (<https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing>) + WikiProject AI Cleanup (<https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup>) | AI-vocab word list *with era breakdown* (2023–mid-24 GPT-4 era: additionally, boasts, bolstered, crucial, delve, garner, intricate, interplay, landscape, meticulous, pivotal, tapestry, testament, vibrant…; mid-24–mid-25: align with, enhance, fostering, highlighting, showcasing…; 2025+: emphasizing, enhance, highlighting, showcasing), plus the parallelism/rule-of-three/copula-avoidance patterns and "words to watch" boxes (stands as a testament, plays a vital role, rich cultural heritage, nestled, in the heart of, boasts a, it's important to note, I hope this helps, would you like…) | ~30 core + dozens of frames | **CC BY-SA 4.0** — attribute in the lexicon file comment; individual words/short phrases are not copyrightable, but attribution is good manners and good satire |
| GitHub slop detectors, for cross-checking: `ahmedak/defluff` (<https://github.com/ahmedak/defluff>, deterministic slop detector with tiered `ai-vocab` lists), `pablocaeg/sloptotal` (<https://github.com/pablocaeg/sloptotal>, 23 linguistic/structural markers), `stef41/lmscan` (<https://github.com/stef41/lmscan>, per-model fingerprints: "GPT-4 loves 'delve'… Claude says 'I'd be happy to'"), `tbhb/vale-ai-tells` (<https://github.com/tbhb/vale-ai-tells>, Vale prose-linter rules for AI tells), `halans/ai-pattern-detection` | tiered lists, per-model fingerprints, transition-word lists | varies | check per repo before copying verbatim (most MIT/Apache; verify) |

**Merge recommendation for `slop-lexicon.json` v2** (see §4 for schema):

1. Import the Kobak `style` list (MIT), pruned: drop words hopeless in speech or too common spoken ("across", "both", "during", "based", "between", "however" stays but down-weighted) — expect ~150 usable of 407. Weight 1 ("mild").
2. Keep + extend current phrase list with Wikipedia's frames (weight 2, "spicy"): "stands as a testament", "plays a pivotal role", "rich cultural heritage", "in the heart of", "serves as a", "it's worth noting", "i hope this helps", "would you like me to", "let me know if". Chatbot-leakage phrases ("as an AI language model", "i'd be happy to") get weight 4 ("radioactive") — someone literally reading ChatGPT aloud.
3. Add the Juzek & Ward 21 focal words at weight 2 where not already present.
4. Everything lowercase, no hyphens/em-dashes in match keys (ASR renders "game-changer" as "game changer"); the loader should normalize both lexicon and text (§2.1).

### 1.7 Perplexity-free signals from the GLTR/detection literature

GLTR (Gehrmann et al. 2019, <https://aclanthology.org/P19-3019/>) visualizes token rank under a LM — needs a LM, excluded. What survives with **no model**:

- Sentence-length CV (§1.1) — this *is* the perplexity-free burstiness the detection literature converged on.
- Length-distribution shape: humans produce short fragments (1–4 words: "Right.", "Exactly.", "No.") — LLM speeches essentially never do. **Fragment rate** = fraction of segments < 5 words; nearly free once segmentation exists, robust, satisfying. Fold into burstiness or keep as its own micro-feature.
- Repetition structure: humans repeat identical bigrams locally (repairs); LLMs avoid exact repeats but recycle *templates*. Bigram-repeat rate is the cheap half (part of disfluency credit).
- Zipf-slope / rank-frequency fits exist in the literature but need more tokens than 250 words to be stable — skip.
- Word-length / syllable proxies (Flesch-style): LLM formal prose has longer words than speech (nominalizations: -tion, -ment, -ity suffix rate; Herbold et al., Reinhart et al.). **Mean characters/word** plus a **suffix-rate** counter is a trivially cheap syntactic-complexity proxy that needs no parser. Human speech ≈ 3.8–4.3 chars/word; LLM keynote prose ≈ 4.8–5.5.

## 2. Feature inventory (v2) — formulas and TS sketches

All features consume a shared `Analysis` object computed once per update:

```ts
interface Analysis {
  raw: string
  norm: string          // lowercased, unicode-normalized, hyphens→space, curly→straight apostrophes
  tokens: string[]      // norm split on /[^a-z0-9']+/
  segments: string[][]  // token arrays per pseudo-sentence (see below)
}
```

### 2.1 Tokenization & segmentation (shared)

```ts
function analyze(text: string): Analysis {
  const norm = text.toLowerCase().normalize('NFKD')
    .replace(/[‘’]/g, "'").replace(/[-–—]/g, ' ')
  const tokens = norm.split(/[^a-z0-9']+/).filter(Boolean)
  // Segments: split raw text on [.?!]+ (smart_format supplies these), then
  // re-split any segment > 35 tokens at ';'/','-nearest-to-midpoint as a fallback,
  // and merge segments < 2 tokens into the previous one ONLY if punctuation was sparse
  // (punctDensity = terminalPunctCount / tokens < 1/40 → treat source as unpunctuated).
  ...
}
```

Segmentation strategy, in order of trust:
1. Terminal punctuation from `smart_format` (Deepgram) — primary.
2. Utterance boundaries: the app already recomputes per finalized utterance; pass utterance boundaries into the window buffer and use them as guaranteed segment breaks. (v1 loses this information by storing a flat string — v2's window should be an array of utterances.)
3. If punctuation density < 1 terminal mark per 40 words (Web Speech API case), burstiness/opener features fall back to utterance-level segments only and their weight is annealed (multiply by `punctConfidence ∈ [0,1]`), rather than reporting garbage.

### 2.2 Features

Each feature returns a subscore in 0..1 (1 = sloppy) plus a confidence 0..1. Normalization is `logi(x, mid, k) = 1/(1+exp(-k*(x-mid)))`.

**F1 — Weighted lexicon rate** (evolution of v1):
```ts
rate = Σ(weight_i × hits_i) × 100 / tokens.length
sub  = logi(rate, 2.0, 1.2)          // weighted hits per 100 words
```
Weights 1/2/4 per §1.6. Keep v1's regex machinery; normalize lexicon keys through the same `norm` pipeline.

**F2 — Burstiness (sentence-length CV):**
```ts
const lens = segments.map(s => s.length)         // need ≥ 5 segments
const cv = stddev(lens) / mean(lens)
sub = logi(-cv, -0.32, 18)   // cv 0.45→~0.08, 0.32→0.5, 0.20→~0.90
confidence = min(1, segments.length / 8) * punctConfidence
```
Numbers anchored to Tarım & Onan (human 0.334 vs LLM 0.18–0.31); midpoint tuned in calibration.

**F3 — Lexical diversity (MATTR, W=50):**
```ts
// incremental sliding window of 50 tokens; average TTR of each position
sub = logi(mattr, 0.76, 25)   // high diversity in *speech* = slop
confidence = min(1, tokens.length / 100)
```

**F4 — Parallelism & template frames:** regex count per 100 words over:
```
not only \S+.{0,40}? but (also )?…
it'?s not (just |only |about )?(a |the )?\w+.{0,30}?it'?s      // punctuation optional!
n[o']t (just|merely|simply) (a |about )?\w+ but (a |about )?
\w+ rather than \w+
(serves|stands|marks|represents) as (a|an|the)
(plays|played) an? (pivotal|crucial|vital|key|central) role
\b\w+, \w+, and \w+\b                    // rule of three (needs commas; weight low)
, (highlighting|underscoring|emphasizing|showcasing|reflecting|demonstrating|ensuring|fostering|reinforcing) (the|its|their|a|an|how)
```
`sub = logi(hitsPer100, 0.8, 3)` — these are rare; even 1–2 per window is damning.

**F5 — Connective/hedge density + opener monotony** (§1.4): 
```ts
connSub  = logi(connectivesPer100, 1.5, 2)
openerAI = fracSegmentsStarting(AI_OPENERS)     // additionally, furthermore, this, it is, …
openerHu = fracSegmentsStarting(HUMAN_OPENERS)  // so, and, but, well, i, you, look, yeah, okay
sub = clamp01(0.6*connSub + 0.4*clamp01(0.5 + openerAI - openerHu))
```

**F6 — Humanity credits (negative feature bundle):**
```ts
disfluency  = per100(['um','uh','er','ah','you know','i mean','sort of','kind of','kinda','gonna','wanna'])
             + bigramRepeatPer100          // "the the", "i i"
pronouns    = per100(['i',"i'm","i've",'me','my','you',"you're",'we',"we're",'us','our'])
contractions = tokens.filter(t => t.includes("'")).length * 100 / tokens.length
credit = 0.5*logi(disfluency, 1.5, 1.5) + 0.3*logi(pronouns, 6, 0.6) + 0.2*logi(contractions, 2.5, 1.2)
sub = 1 - credit   // high humanity → low subscore
```
Cap: disfluency term contributes 0 (not negative) when Deepgram `filler_words` is off and nothing is found — implemented naturally by the logistic floor. Recommend setting `filler_words=true` in the Deepgram options.

**F7 — Word-length / nominalization proxy:**
```ts
mcw = meanCharsPerWord(tokens)                          // human speech ~4.0, slop ~5.0
suffixRate = per100(tokens.filter(t => /(tion|ment|ity|ance|ence|ization)s?$/.test(t)))
sub = 0.6*logi(mcw, 4.6, 4) + 0.4*logi(suffixRate, 3, 1.0)
```

## 3. Combination model

Weighted-logistic over feature subscores, confidence-weighted so missing/low-data features gracefully drop out:

```ts
const W = { lexicon: 2.2, burst: 1.4, mattr: 0.8, parallel: 1.8, discourse: 1.4, humanity: 1.6, wordlen: 0.8 }
const BIAS = -0.55   // sets the "empty/neutral" resting score ≈ 0.36 — dial should idle mid-left, not at 0

function combine(feats: Feat[]): number {
  let z = BIAS, wsum = 0
  for (const f of feats) { z += W[f.name] * f.confidence * (f.sub - 0.5); wsum += W[f.name] * f.confidence }
  // z is a centered weighted vote; squash with slope normalized by active weight
  return 1 / (1 + Math.exp(-2.2 * z / Math.max(1, wsum * 0.35)))
}
```

Properties: monotone in every subscore; a single feature can push but not peg the dial; features with confidence 0 (too few segments, no punctuation) vanish rather than dilute; the humanity bundle can rescue a business-jargon human (says "synergy" but also "um, you know, we we tried"). Keep v1's `LexicalResult` shape — add `features: Record<string, {sub, confidence, detail}>` so the UI can show *why* ("metronomic sentences", "3× 'furthermore'", "zero disfluencies") — comedy gold for the detail line.

Initial weights above are priors; calibration (§5) replaces them with fitted values, hard-coded back into the source with a comment naming the calibration run.

## 4. Lexicon v2 schema

```jsonc
{
  "attribution": "Word lists derived from: Kobak et al. 2025 (MIT, github.com/berenslab/llm-excess-vocab), Juzek & Ward COLING 2025 (arXiv:2412.11385), Wikipedia:Signs_of_AI_writing (CC BY-SA 4.0).",
  "phrases": [ { "match": "delve", "weight": 2 }, { "match": "as an ai language model", "weight": 4 }, ... ],
  "patterns": [ { "match": "it'?s not (just )?\\w+.{0,30}?it'?s", "weight": 2 }, ... ],
  "connectives": ["furthermore", "moreover", ...],
  "aiOpeners": ["additionally", ...],
  "humanOpeners": ["so", "and", ...],
  "disfluencies": ["um", "uh", ...]
}
```
Backwards-compatible loader optional; simpler to just migrate the file. Keep "half the fun is tuning this" spirit: everything data-driven, nothing hard-coded in TS except formulas.

## 5. Calibration plan

Offline, once, in a `scripts/calibrate-lexical.ts` (or Python notebook — output is just ~10 numbers):

**Human-speech corpus (label 0):**
- Presidential debate transcripts — The American Presidency Project (<https://www.presidency.ucsb.edu/documents/app-categories/elections-and-transitions/debates>) and rev.com transcript library. Adversarial, extemporaneous, ASR-like messiness when taken from live captions.
- TED talk transcripts (<https://www.ted.com/talks>) — *scripted* human speech; deliberately included as the hard negative class (rehearsed humans are less bursty; the detector should read them mid-dial, which is satirically correct).
- A few podcast/interview transcripts (e.g. rev.com samples, or run any Creative Commons interview audio through the app's own Deepgram path — best possible domain match).

**Slop corpus (label 1):**
- Generate 30–50 "conference keynote" / "TED-style talk" / "campaign stump speech" scripts from ≥3 models (GPT-4o, Claude, Gemini, plus one older GPT-4-era output for the delve-heavy dialect).
- **Transcription-simulate** them: strip formatting, lowercase-ish, drop em-dashes/semicolons, optionally TTS→Deepgram round-trip for a subset (the app already has the pipeline; ~an hour of clicking).

**Procedure:** compute the 7 subscores per 250-word window over both corpora → fit logistic regression (any tool; even a 20-line gradient-descent TS script) → inspect per-feature AUCs (drop any feature whose solo AUC < 0.6 on transcribed data) → hard-code weights + midpoints. Sanity targets: median human debate window ≤ 0.35; median LLM keynote ≥ 0.75; TED humans land 0.4–0.6 and that's the joke working as intended.

Also produce a `?demo` fixture pair (one human debate excerpt, one GPT keynote) for regression-testing the dial.

## 6. Performance notes

Window ≤ 1000 words, recomputed a few times/minute. Everything above is single-pass or regex over ≤ ~7KB of text:
- analyze(): one pass tokenize + segment — O(n).
- F1/F4/F5 regex sets: ~200 precompiled regexes × 7KB — sub-millisecond territory; if it ever matters, compile phrase list into one alternation per weight tier, or a token-hash lookup for single words (Map lookup per token) with regexes only for multiword frames. Recommended anyway: single-word entries via `Set`, multiword via regex — cuts regex count ~4×.
- MATTR: incremental counts, O(n).
- No allocation pressure worth thinking about. Total budget realistically < 2ms per update on any laptop. No new dependencies needed; zero network.

Bundle: the merged lexicon (~600 entries) is ~10–15KB of JSON, fine.

## 7. Risks & limitations (document these on the About page — they're funny)

- **Topic bias:** an authentic human VP of Synergy scores high. Feature, not bug — the meter measures slop, not silicon. Say so.
- **Scripted humans** (TED, State of the Union) drift toward the middle. Also fine satirically; but it means v2 is *not* a forensic detector and must never be presented as one.
- **ASR nondeterminism:** Web Speech API's missing punctuation disables F2/F5-opener; confidence-annealing handles it, but the dial is livelier on Deepgram. Note in README.
- **Filler-word stripping:** without `filler_words=true`, Deepgram deletes the strongest humanity signal. One-line config fix; do it.
- **Lexicon drift:** "delve" already faded post-2024 (Wikipedia's era table); the lexicon needs seasonal weeding like any garden. The era-tiered structure makes this a JSON edit.
- **Non-native and neurodivergent speakers** may show fewer disfluencies and more formal connectives — the humanity-credit design (credits can only help, presence of formality alone can't peg the dial) mitigates but doesn't remove this. Another reason the app stays satire.
- **Diversity-direction gamble:** the MATTR direction (§1.2) is genre-dependent; its weight is deliberately low until calibration confirms it. If calibration shows AUC < 0.6, drop F3 — the model degrades gracefully.

## 8. Build-effort estimate

| Task | Hours |
|---|---|
| Lexicon v2: merge Kobak/Wikipedia/Juzek lists, prune for speech, new schema + loader | 3–4 |
| `analyze()` shared tokenizer/segmenter incl. utterance-boundary plumbing from the transcript buffer | 2–3 |
| Features F2–F7 + unit tests with canned transcripts | 4–5 |
| Combination model + result surface (feature breakdown in `detail`) | 1–2 |
| Calibration: corpus assembly, generation, fit, bake weights | 4–6 |
| README/About copy + demo fixtures | 1 |
| **Total** | **15–21 h** |

Incremental path if time-boxed: lexicon v2 + F2 burstiness + F6 humanity credits alone (~6h) already fixes v1's two worst failure modes (spikiness, no structural signal).

## 9. Source list

- Tarım & Onan 2025, stylometric comparison w/ burstiness=CV numbers: <https://arxiv.org/html/2507.10475v1>
- Kobak et al. 2025, excess vocabulary (Science Advances): <https://www.science.org/doi/10.1126/sciadv.adt3813>; arXiv: <https://arxiv.org/html/2406.07016v1>; data (MIT): <https://github.com/berenslab/llm-excess-vocab>
- Juzek & Ward, COLING 2025: <https://aclanthology.org/2025.coling-main.426/>; <https://arxiv.org/abs/2412.11385>
- Wikipedia:Signs of AI writing (CC BY-SA 4.0): <https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing>; WikiProject AI Cleanup: <https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup>
- Reinhart et al., PNAS 2025, participial clauses/nominalizations: <https://www.pnas.org/doi/10.1073/pnas.2422455122>
- Muñoz-Ortiz et al. 2024, human vs LLM news text: <https://link.springer.com/article/10.1007/s10462-024-10903-2>
- Herbold et al. 2023, ChatGPT vs human essays (Sci Rep): <https://www.nature.com/articles/s41598-023-45644-9>
- EFL ChatGPT text identification (lexical diversity/nominalization direction): <https://www.sciencedirect.com/science/article/pii/S2666799124000236>
- MATTR: Covington & McFall 2010, <https://doi.org/10.1080/09296171003643098>; MTLD: McCarthy & Jarvis 2010, <https://doi.org/10.3758/BRM.42.2.381>
- GLTR: Gehrmann et al. 2019, <https://aclanthology.org/P19-3019/>
- Pangram on limits of perplexity/burstiness: <https://www.pangram.com/blog/why-perplexity-and-burstiness-fail-to-detect-ai>
- Deepgram filler words option: <https://developers.deepgram.com/docs/filler-words>
- GitHub slop detectors surveyed: <https://github.com/ahmedak/defluff>, <https://github.com/pablocaeg/sloptotal>, <https://github.com/stef41/lmscan>, <https://github.com/tbhb/vale-ai-tells>, <https://github.com/halans/ai-pattern-detection>
