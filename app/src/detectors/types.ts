export interface DetectorResult {
  /** 0 (artisanal) .. 1 (pure slop) */
  score: number
  source: 'lexical' | 'pangram' | 'sapling'
  label: string
  detail?: string
  confidence?: string
  at: number
}

/** Pangram sub-window, kept for transcript tinting (SPEC §3.4). */
export interface ScoredWindow {
  text: string
  label: string
  aiAssistanceScore: number
  confidence: string
  startIndex: number
  endIndex: number
}
