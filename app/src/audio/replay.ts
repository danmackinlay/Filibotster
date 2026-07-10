import type { SttEvents, SttSource } from './stt'

/**
 * Replay source: feeds a text through the STT event interface at a given WPM,
 * word by word with sentence-level finalization. Loops forever. No mic, no
 * keys — the dev/demo backbone.
 */
export class ReplaySource implements SttSource {
  readonly name = 'replay'
  private timer: number | undefined
  private sentences: string[][]
  private si = 0
  private wi = 0

  constructor(
    text: string,
    private wpm: number,
    private events: SttEvents,
  ) {
    this.sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0)
      .map((s) => s.trim().split(' '))
  }

  async start(): Promise<void> {
    this.events.onStatus('live', 'replay')
    this.tick()
  }

  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.events.onStatus('off')
  }

  private tick = (): void => {
    const sentence = this.sentences[this.si]
    this.wi++
    if (this.wi >= sentence.length) {
      this.events.onFinal(sentence.join(' '))
      this.wi = 0
      this.si = (this.si + 1) % this.sentences.length
    } else {
      this.events.onInterim(sentence.slice(0, this.wi).join(' '))
    }
    const base = 60_000 / this.wpm
    const jitter = base * (0.6 + Math.random() * 0.8)
    this.timer = window.setTimeout(this.tick, jitter)
  }
}
