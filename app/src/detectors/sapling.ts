import type { DetectorResult } from './types'
import { labelFor } from './lexical'

/**
 * Sapling AI detector client (docs/research-commercial-detectors.md).
 * Sync single POST, key travels in the JSON body, CORS is open — so this
 * runs browser-direct with no relay. Returns a raw continuous P(AI), which
 * is exactly the "dial, not verdict" shape we want, and is markedly less
 * verdict-smoothed than Pangram.
 */

export const USD_PER_KCHAR = 0.005

export interface SaplingVerdict extends DetectorResult {
  rttMs: number
  sentenceScores: Array<{ sentence: string; score: number }>
}

export class SaplingClient {
  charsSent = 0

  constructor(private getApiKey: () => string) {}

  get configured(): boolean {
    return this.getApiKey().length > 0
  }

  get costUsd(): number {
    return (this.charsSent / 1000) * USD_PER_KCHAR
  }

  async scan(text: string): Promise<SaplingVerdict> {
    const started = performance.now()
    let res: Response
    try {
      res = await fetch('https://api.sapling.ai/api/v1/aidetect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: this.getApiKey(), text, sent_scores: true }),
      })
    } catch {
      throw new SaplingError(0)
    }
    if (!res.ok) {
      let detail: string | undefined
      try {
        detail = ((await res.json()) as { msg?: string }).msg
      } catch {
        /* non-JSON error body */
      }
      throw new SaplingError(res.status, detail)
    }
    this.charsSent += text.length
    const body = (await res.json()) as {
      score?: number
      sentence_scores?: Array<{ sentence: string; score: number }>
    }
    const score = Math.max(0, Math.min(1, body.score ?? 0))
    return {
      score,
      source: 'sapling',
      label: labelFor(score),
      detail: `P(AI) ${Math.round(score * 100)}%`,
      at: Date.now(),
      rttMs: Math.round(performance.now() - started),
      sentenceScores: body.sentence_scores ?? [],
    }
  }
}

export class SaplingError extends Error {
  constructor(
    public status: number,
    detail?: string,
  ) {
    super(detail ?? SaplingError.describe(status))
  }

  static describe(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return 'invalid Sapling API key'
      case 402:
        return 'Sapling account out of credits'
      case 429:
        return 'Sapling rate limit hit'
      case 0:
        return 'Sapling unreachable'
      default:
        return `Sapling error (HTTP ${status})`
    }
  }
}
