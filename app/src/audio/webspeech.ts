import type { SttEvents, SttSource } from './stt'

// Minimal typings for the (non-standard) Web Speech API.
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((ev: { error: string }) => void) | null
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined
}

export function webSpeechAvailable(): boolean {
  return getRecognitionCtor() !== undefined
}

/** Sessions that die faster than this without producing a result count as fruitless. */
const FRUITLESS_MS = 3000
const MAX_FRUITLESS = 4

/**
 * Web Speech API source (free, no key). Reliable only in real Google Chrome:
 * Chromium forks expose the API but their recognizer usually dies instantly
 * with error 'network' (no Google speech credentials). Chrome also ends
 * recognition every ~60s, so `onend` restarts it — but with backoff, and if
 * sessions keep dying young without ever producing a result we give up with
 * an actionable error instead of pulsing forever.
 * Note: uses the system default input; the mic picker does not apply.
 */
export class WebSpeechSource implements SttSource {
  readonly name = 'webspeech'
  private rec: SpeechRecognitionLike | undefined
  private running = false
  private restartTimer: number | undefined
  private sessionStart = 0
  private gotResult = false
  private fruitless = 0
  private lastError: string | undefined

  constructor(private events: SttEvents) {}

  async start(): Promise<void> {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      this.events.onStatus('error', 'Web Speech API not available in this browser')
      throw new Error('Web Speech API not available')
    }
    this.running = true
    this.fruitless = 0
    this.events.onStatus('connecting')
    const rec = new Ctor()
    this.rec = rec
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (ev) => {
      this.gotResult = true
      this.fruitless = 0
      this.events.onStatus('live', 'web speech')
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) this.events.onFinal(r[0].transcript.trim())
        else interim += r[0].transcript
      }
      if (interim) this.events.onInterim(interim.trim())
    }
    rec.onerror = (ev) => {
      this.lastError = ev.error
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        this.running = false
        this.events.onStatus('error', `mic ${ev.error}`)
      }
    }
    rec.onend = () => this.handleEnd()
    this.beginSession()
  }

  stop(): void {
    this.running = false
    if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
    this.rec?.stop()
    this.events.onStatus('off')
  }

  private beginSession(): void {
    this.sessionStart = Date.now()
    this.gotResult = false
    try {
      this.rec?.start()
    } catch {
      /* already started */
    }
  }

  private handleEnd(): void {
    if (!this.running) return
    const shortLived = Date.now() - this.sessionStart < FRUITLESS_MS
    if (shortLived && !this.gotResult) this.fruitless++
    if (this.fruitless >= MAX_FRUITLESS) {
      this.running = false
      const why = this.lastError ?? 'sessions end immediately'
      this.events.onStatus(
        'error',
        `speech service unusable (${why}) — use Google Chrome, or a Deepgram key in settings`,
      )
      return
    }
    this.events.onStatus('reconnecting')
    const delay = shortLived ? Math.min(5000, 250 * 2 ** this.fruitless) : 0
    this.restartTimer = window.setTimeout(() => {
      if (this.running) this.beginSession()
    }, delay)
  }
}
