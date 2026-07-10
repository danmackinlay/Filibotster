import type { DetectorResult, ScoredWindow } from './types'
import { labelFor } from './lexical'

export interface PangramVerdict extends DetectorResult {
  headline: string
  fractionAi: number
  fractionAiAssisted: number
  fractionHuman: number
  windows: ScoredWindow[]
  rttMs: number
}

interface TaskResponse {
  stage: string
  headline?: string
  prediction_short?: string
  fraction_ai?: number
  fraction_ai_assisted?: number
  fraction_human?: number
  windows?: Array<{
    text: string
    label: string
    ai_assistance_score: number
    confidence: string
    start_index: number
    end_index: number
  }>
}

export const CREDIT_USD = 0.05
export const MIN_WORDS = 80

/**
 * Pangram v3 async task client, via the CORS relay (SPEC §3.3, §3.5).
 * POST /task → task_id, then poll GET /task/{id} until STAGE_SUCCESS/FAILED.
 */
export class PangramClient {
  creditsSpent = 0

  constructor(
    private getRelayUrl: () => string,
    private getApiKey: () => string,
  ) {}

  get configured(): boolean {
    return this.getRelayUrl().length > 0 && this.getApiKey().length > 0
  }

  async scan(text: string, { pollMs = 1000, timeoutMs = 20_000 } = {}): Promise<PangramVerdict> {
    const relay = this.getRelayUrl().replace(/\/$/, '')
    const headers = { 'Content-Type': 'application/json', 'x-api-key': this.getApiKey() }
    const started = performance.now()

    const submit = await fetch(`${relay}/task`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    })
    if (!submit.ok) throw new PangramError(submit.status)
    const { task_id } = (await submit.json()) as { task_id: string }
    this.creditsSpent += 1

    while (performance.now() - started < timeoutMs) {
      await sleep(pollMs)
      const poll = await fetch(`${relay}/task/${task_id}`, { headers: { 'x-api-key': this.getApiKey() } })
      if (!poll.ok) throw new PangramError(poll.status)
      const body = (await poll.json()) as TaskResponse
      if (body.stage === 'STAGE_FAILED') {
        throw new PangramError(200, body.headline ?? 'analysis failed')
      }
      if (body.stage === 'STAGE_SUCCESS') {
        const fractionAi = body.fraction_ai ?? 0
        const fractionAiAssisted = body.fraction_ai_assisted ?? 0
        const score = Math.min(1, fractionAi + 0.5 * fractionAiAssisted)
        return {
          score,
          source: 'pangram',
          label: labelFor(score),
          headline: body.headline ?? '',
          detail: body.prediction_short,
          at: Date.now(),
          fractionAi,
          fractionAiAssisted,
          fractionHuman: body.fraction_human ?? 0,
          windows: (body.windows ?? []).map((w) => ({
            text: w.text,
            label: w.label,
            aiAssistanceScore: w.ai_assistance_score,
            confidence: w.confidence,
            startIndex: w.start_index,
            endIndex: w.end_index,
          })),
          rttMs: Math.round(performance.now() - started),
        }
      }
    }
    throw new PangramError(0, 'timed out waiting for verdict')
  }
}

export class PangramError extends Error {
  constructor(
    public status: number,
    detail?: string,
  ) {
    super(detail ?? PangramError.describe(status))
  }

  static describe(status: number): string {
    switch (status) {
      case 401: return 'invalid Pangram API key'
      case 402: return 'Pangram account out of credits'
      case 429: return 'Pangram rate limit hit'
      case 0: return 'relay unreachable'
      default: return `Pangram error (HTTP ${status})`
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
