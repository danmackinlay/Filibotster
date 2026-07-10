/**
 * Needle fusion + physics (SPEC §3.3). The dial tracks
 * max(pangram, lexical × 0.9): Pangram is authoritative, the lexical meter
 * wiggles the needle between polls. A slightly-underdamped spring plus
 * WPM-proportional jitter makes it behave like a meter, not a slideshow.
 */
export class Needle {
  private pos = 0
  private vel = 0
  private lexical = 0
  private pangram: number | null = null
  private wpm = 0

  setLexical(score: number): void {
    this.lexical = score
  }

  setPangram(score: number | null): void {
    this.pangram = score
  }

  setWpm(wpm: number): void {
    this.wpm = wpm
  }

  get target(): number {
    return Math.max(this.pangram ?? 0, this.lexical * 0.9)
  }

  /** Jump straight to the current target (demo/screenshot mode). */
  snap(): void {
    this.pos = this.target
    this.vel = 0
  }

  /** Advance physics by dt seconds; returns needle position 0..1. */
  step(dt: number): number {
    const k = 18
    const c = 2 * Math.sqrt(k) * 0.75 // underdamped: a little bounce
    const acc = k * (this.target - this.pos) - c * this.vel
    this.vel += acc * dt
    this.pos += this.vel * dt

    const jitterAmp = Math.min(0.012, this.wpm / 20_000)
    const jitter = (Math.random() - 0.5) * 2 * jitterAmp

    return Math.max(0, Math.min(1, this.pos + jitter))
  }

  get value(): number {
    return Math.max(0, Math.min(1, this.pos))
  }
}
