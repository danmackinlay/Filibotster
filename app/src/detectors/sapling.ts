import type { CloudVerdict, CloudDetector } from './types'
import { DetectorError } from './types'

/**
 * Sapling AI detector client (docs/research-commercial-detectors.md).
 * Sync single POST, key travels in the JSON body, CORS is open — so this
 * runs browser-direct with no relay. Returns a raw continuous P(AI), which
 * is exactly the "dial, not verdict" shape we want, and is markedly less
 * verdict-smoothed than Pangram.
 */

const USD_PER_KCHAR = 0.005

export class SaplingClient implements CloudDetector {
  private charsSent = 0

  constructor(private getApiKey: () => string) {}

  get configured(): boolean {
    return this.getApiKey().length > 0
  }

  get costUsd(): number {
    return (this.charsSent / 1000) * USD_PER_KCHAR
  }

  async scan(text: string): Promise<CloudVerdict> {
    const started = performance.now()
    let res: Response
    try {
      res = await fetch('https://api.sapling.ai/api/v1/aidetect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: this.getApiKey(), text }),
      })
    } catch {
      throw new DetectorError('Sapling', 0)
    }
    if (!res.ok) {
      let detail: string | undefined
      try {
        detail = ((await res.json()) as { msg?: string }).msg
      } catch {
        /* non-JSON error body */
      }
      throw new DetectorError('Sapling', res.status, detail)
    }
    this.charsSent += text.length
    const body = (await res.json()) as { score?: number }
    const score = Math.max(0, Math.min(1, body.score ?? 0))
    return {
      score,
      detail: `P(AI) ${Math.round(score * 100)}%`,
      rttMs: Math.round(performance.now() - started),
    }
  }
}
