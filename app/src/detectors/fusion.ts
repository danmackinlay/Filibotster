/**
 * Needle fusion + physics (SPEC §3.3). The dial tracks
 * max(cloud, lexical × 0.9): the cloud verdict (Pangram or Sapling) is
 * authoritative, and the lexical meter wiggles the needle between polls.
 * A slightly-underdamped spring plus WPM-proportional jitter makes it
 * behave like a meter, not a slideshow.
 */
export class Needle {
  private pos = 0
  private vel = 0
  private lexical = 0
  private cloud: number | null = null
  private wpm = 0

  setLexical(score: number): void {
    this.lexical = score
  }

  setCloud(score: number | null): void {
    this.cloud = score
  }

  setWpm(wpm: number): void {
    this.wpm = wpm
  }

  get target(): number {
    return Math.max(this.cloud ?? 0, this.lexical * 0.9)
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
