import type { SttEvents, SttSource } from './stt'

/**
 * Deepgram streaming source — M2.
 *
 * Plan (see SPEC.md §3.1): getUserMedia → AudioWorklet downsample to 16 kHz
 * mono linear16 → chunks over
 *   wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true
 * authenticated via WebSocket subprotocol ['token', apiKey] — works directly
 * from the browser, no relay needed. Auto-reconnect with backoff.
 */
export class DeepgramSource implements SttSource {
  readonly name = 'deepgram'

  constructor(
    _apiKey: string,
    private events: SttEvents,
  ) {}

  async start(): Promise<void> {
    this.events.onStatus('error', 'Deepgram backend not built yet (M2) — use Web Speech or replay')
    throw new Error('Deepgram backend is scheduled for M2')
  }

  stop(): void {
    this.events.onStatus('off')
  }
}
