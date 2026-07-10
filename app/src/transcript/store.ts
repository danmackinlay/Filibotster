export interface Word {
  w: string
  at: number
}

export class TranscriptStore {
  private words: Word[] = []
  private listeners: Array<() => void> = []

  appendFinal(text: string, at = Date.now()): void {
    const tokens = text.split(/\s+/).filter((t) => t.length > 0)
    for (const t of tokens) this.words.push({ w: t, at })
    if (tokens.length) this.emit()
  }

  windowText(nWords: number): string {
    return this.words
      .slice(-nWords)
      .map((x) => x.w)
      .join(' ')
  }

  get wordCount(): number {
    return this.words.length
  }

  /** Wall-clock span of the last nWords (what a scan of that window covers). */
  windowSpan(nWords: number): { from: number; to: number } | null {
    if (this.words.length === 0) return null
    const start = Math.max(0, this.words.length - nWords)
    return { from: this.words[start].at, to: this.words[this.words.length - 1].at }
  }

  /** Words per minute over the trailing window (default 60 s). */
  wpm(windowMs = 60_000): number {
    const cutoff = Date.now() - windowMs
    let n = 0
    for (let i = this.words.length - 1; i >= 0 && this.words[i].at >= cutoff; i--) n++
    return Math.round((n * 60_000) / windowMs)
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb)
  }

  private emit(): void {
    for (const cb of this.listeners) cb()
  }
}
