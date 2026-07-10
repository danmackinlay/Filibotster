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

/**
 * Web Speech API source (free, no key; Chrome-quality only). Chrome ends
 * recognition every ~60s, so `onend` restarts it until stop() is called.
 * Note: uses the system default input; the mic picker does not apply.
 */
export class WebSpeechSource implements SttSource {
  readonly name = 'webspeech'
  private rec: SpeechRecognitionLike | undefined
  private running = false

  constructor(private events: SttEvents) {}

  async start(): Promise<void> {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      this.events.onStatus('error', 'Web Speech API not available in this browser')
      throw new Error('Web Speech API not available')
    }
    this.running = true
    this.events.onStatus('connecting')
    const rec = new Ctor()
    this.rec = rec
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (ev) => {
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
      // 'no-speech' and 'aborted' are routine; onend handles the restart.
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        this.running = false
        this.events.onStatus('error', `mic ${ev.error}`)
      }
    }
    rec.onend = () => {
      if (this.running) {
        this.events.onStatus('reconnecting')
        try {
          rec.start()
        } catch {
          /* already started */
        }
      }
    }
    rec.start()
    this.events.onStatus('live', 'web speech')
  }

  stop(): void {
    this.running = false
    this.rec?.stop()
    this.events.onStatus('off')
  }
}
