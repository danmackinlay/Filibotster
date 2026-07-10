/** A detector's read on the current window. */
export interface DetectorResult {
  /** 0 (artisanal) .. 1 (pure slop) */
  score: number
  /** short human-readable summary, shown on the diagnostics rail */
  detail?: string
}

/** What a paid cloud detector (Pangram, Sapling) returns from a scan. */
export interface CloudVerdict extends DetectorResult {
  /** the detector's own headline verdict, if it has one (Pangram does) */
  headline?: string
  /** round-trip time of the scan, for the diagnostics rail */
  rttMs: number
}

/**
 * A swappable paid verdict backend. Pangram (via the relay) and Sapling
 * (browser-direct) both implement this, so the scheduler in main.ts drives
 * whichever is selected without caring which one it is.
 */
export interface CloudDetector {
  readonly configured: boolean
  readonly costUsd: number
  scan(text: string): Promise<CloudVerdict>
}

/**
 * Shared error for cloud detectors. `status` is the upstream HTTP status
 * (0 = network/offline); main.ts reads it to decide whether to back off.
 */
export class DetectorError extends Error {
  constructor(
    service: string,
    readonly status: number,
    detail?: string,
  ) {
    super(detail ?? DetectorError.describe(service, status))
  }

  static describe(service: string, status: number): string {
    switch (status) {
      case 401:
      case 403:
        return `invalid ${service} API key`
      case 402:
        return `${service} account out of credits`
      case 429:
        return `${service} rate limit hit`
      case 0:
        return `${service} unreachable`
      default:
        return `${service} error (HTTP ${status})`
    }
  }
}
