import type { CloudVerdict, CloudDetector } from './types'
import { DetectorError } from './types'

interface TaskResponse {
  stage: string
  headline?: string
  prediction_short?: string
  fraction_ai?: number
  fraction_ai_assisted?: number
  windows?: Array<{
    text: string
    ai_assistance_score: number
    word_count?: number
  }>
}

const CREDIT_USD = 0.05
export const MIN_WORDS = 80

/**
 * Pangram v3 async task client, via the CORS relay (SPEC §3.3, §3.5).
 * POST /task → task_id, then poll GET /task/{id} until STAGE_SUCCESS/FAILED.
 */
export class PangramClient implements CloudDetector {
  private creditsSpent = 0

  constructor(
    private getRelayUrl: () => string,
    private getApiKey: () => string,
  ) {}

  get configured(): boolean {
    return this.getApiKey().length > 0
  }

  get costUsd(): number {
    return this.creditsSpent * CREDIT_USD
  }

  async scan(text: string, { pollMs = 1000, timeoutMs = 20_000 } = {}): Promise<CloudVerdict> {
    const relay = this.getRelayUrl().replace(/\/$/, '')
    const started = performance.now()

    const submit = await this.request(`${relay}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.getApiKey() },
      body: JSON.stringify({ text }),
    })
    const { task_id } = (await submit.json()) as { task_id: string }
    this.creditsSpent += 1

    while (performance.now() - started < timeoutMs) {
      await sleep(pollMs)
      const poll = await this.request(`${relay}/task/${task_id}`, {
        headers: { 'x-api-key': this.getApiKey() },
      })
      const body = (await poll.json()) as TaskResponse
      if (body.stage === 'STAGE_FAILED') {
        throw new DetectorError('Pangram', 200, body.headline ?? 'analysis failed')
      }
      if (body.stage === 'STAGE_SUCCESS') {
        // The fractions are proportions of text that crossed Pangram's
        // classification threshold — borderline speech collapses to 0. The
        // per-window ai_assistance_score is continuous, so a length-weighted
        // mean of it keeps the needle alive when Pangram declines to convict;
        // take the max so a confident verdict still pegs the dial.
        const fractionAi = body.fraction_ai ?? 0
        const fractionAiAssisted = body.fraction_ai_assisted ?? 0
        const fractionScore = Math.min(1, fractionAi + 0.5 * fractionAiAssisted)
        const wins = body.windows ?? []
        const words = (w: { word_count?: number; text: string }) =>
          w.word_count ?? w.text.split(/\s+/).length
        const totalWords = wins.reduce((n, w) => n + words(w), 0)
        const meanAssist =
          totalWords > 0
            ? wins.reduce((s, w) => s + w.ai_assistance_score * words(w), 0) / totalWords
            : 0
        const score = Math.max(fractionScore, meanAssist)
        return {
          score,
          detail: body.prediction_short,
          headline: body.headline,
          rttMs: Math.round(performance.now() - started),
        }
      }
    }
    throw new DetectorError('Pangram', 0, 'timed out waiting for verdict')
  }

  /** fetch that turns a network failure or non-2xx response into a DetectorError. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch {
      throw new DetectorError('Pangram', 0)
    }
    if (!res.ok) throw new DetectorError('Pangram', res.status)
    return res
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
