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

  sessionText(): string {
    return this.words.map((x) => x.w).join(' ')
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
