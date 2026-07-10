import lexicon from '../slop-lexicon.json'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const PHRASE_RES: RegExp[] = lexicon.phrases.map(
  (p) => new RegExp(`\\b${escape(p).replace(/\s+/g, '\\s+')}\\b`, 'gi'),
)
const PATTERN_RES: RegExp[] = lexicon.patterns.map((p) => new RegExp(p, 'gi'))

// Logistic squash of (hits per 100 words) into 0..1.
// rate 0 → ~0.04, ~2.2 → 0.5, ~5 → ~0.98
const K = 1.4
const MIDPOINT = 2.2

export interface LexicalResult {
  /** 0 (artisanal) .. 1 (pure slop) */
  score: number
  hitsPer100: number
  topHits: string[]
}

export function lexicalScore(text: string): LexicalResult {
  const words = text.split(/\s+/).filter((w) => w.length > 0).length
  const counts = new Map<string, number>()
  let hits = 0

  if (words > 0) {
    for (let i = 0; i < PHRASE_RES.length; i++) {
      const m = text.match(PHRASE_RES[i])
      if (m) {
        hits += m.length
        counts.set(lexicon.phrases[i], (counts.get(lexicon.phrases[i]) ?? 0) + m.length)
      }
    }
    for (let i = 0; i < PATTERN_RES.length; i++) {
      const m = text.match(PATTERN_RES[i])
      if (m) {
        // Constructions are stronger signals than single words.
        hits += m.length * 2
        counts.set(m[0].toLowerCase(), (counts.get(m[0].toLowerCase()) ?? 0) + m.length)
      }
    }
  }

  const rate = words > 0 ? (hits * 100) / words : 0
  const score = words > 0 ? 1 / (1 + Math.exp(-K * (rate - MIDPOINT))) : 0
  const topHits = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => (v > 1 ? `${k}×${v}` : k))

  return { score, hitsPer100: rate, topHits }
}
