import type { SttEvents, SttSource } from './stt'

/**
 * Deepgram streaming source (SPEC §3.1): getUserMedia → AudioWorklet tap →
 * resample to 16 kHz linear16 → websocket to Deepgram, authenticated via the
 * ['token', apiKey] subprotocol — works directly from the browser, no relay.
 * Auto-reconnects with backoff; gives up early on refused connections
 * (almost always a bad key).
 */

const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('pcm-tap', PcmTap)
`

const TARGET_RATE = 16_000
const KEEPALIVE_MS = 8000
const MAX_REFUSED = 3

/** Linear-interpolation resampler with fractional carry across chunks. */
class Resampler {
  private pos = 0
  private prev = 0
  private hasPrev = false

  constructor(private inRate: number) {}

  process(input: Float32Array): Int16Array {
    const step = this.inRate / TARGET_RATE
    const out: number[] = []
    let pos = this.pos
    while (pos < input.length) {
      const i = Math.floor(pos)
      const frac = pos - i
      const a = i === 0 ? (this.hasPrev ? this.prev : input[0]) : input[i - 1]
      const b = input[Math.min(i, input.length - 1)]
      const sample = a + (b - a) * frac
      out.push(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))))
      pos += step
    }
    this.pos = pos - input.length
    this.prev = input[input.length - 1]
    this.hasPrev = true
    return Int16Array.from(out)
  }
}

interface DeepgramResult {
  type?: string
  is_final?: boolean
  channel?: { alternatives?: Array<{ transcript?: string }> }
}

export class DeepgramSource implements SttSource {
  readonly name = 'deepgram'
  private ws: WebSocket | undefined
  private ctx: AudioContext | undefined
  private stream: MediaStream | undefined
  private running = false
  private retries = 0
  private refused = 0
  private keepalive: number | undefined
  private reconnectTimer: number | undefined

  constructor(
    private apiKey: string,
    private events: SttEvents,
    private deviceId?: string,
  ) {}

  async start(): Promise<void> {
    this.running = true
    this.events.onStatus('connecting')

    // Mic first, so permission problems surface before we burn a socket.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: this.deviceId ? { deviceId: { exact: this.deviceId } } : true,
      })
    } catch (err) {
      this.running = false
      const name = err instanceof DOMException ? err.name : String(err)
      this.events.onStatus('error', `mic: ${name}`)
      throw err
    }

    this.ctx = new AudioContext()
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
    await this.ctx.audioWorklet.addModule(moduleUrl)
    URL.revokeObjectURL(moduleUrl)

    const source = this.ctx.createMediaStreamSource(this.stream)
    const tap = new AudioWorkletNode(this.ctx, 'pcm-tap')
    source.connect(tap)

    const resampler = new Resampler(this.ctx.sampleRate)
    tap.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(resampler.process(ev.data).buffer)
      }
    }

    this.connect()
  }

  stop(): void {
    this.running = false
    if (this.keepalive !== undefined) clearInterval(this.keepalive)
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer)
    try {
      this.ws?.send(JSON.stringify({ type: 'CloseStream' }))
    } catch {
      /* already closed */
    }
    this.ws?.close()
    this.teardownAudio()
    this.events.onStatus('off')
  }

  private teardownAudio(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => {})
  }

  private connect(): void {
    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      interim_results: 'true',
      encoding: 'linear16',
      sample_rate: String(TARGET_RATE),
      channels: '1',
    })
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['token', this.apiKey])
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    let opened = false

    ws.onopen = () => {
      opened = true
      this.retries = 0
      this.refused = 0
      this.events.onStatus('live', 'deepgram')
      if (this.keepalive !== undefined) clearInterval(this.keepalive)
      this.keepalive = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
      }, KEEPALIVE_MS)
    }

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      let msg: DeepgramResult
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type !== 'Results') return
      const text = msg.channel?.alternatives?.[0]?.transcript ?? ''
      if (!text) return
      if (msg.is_final) this.events.onFinal(text)
      else this.events.onInterim(text)
    }

    ws.onclose = () => {
      if (this.keepalive !== undefined) clearInterval(this.keepalive)
      if (!this.running) return
      if (!opened) {
        this.refused++
        if (this.refused >= MAX_REFUSED) {
          this.running = false
          this.teardownAudio()
          this.events.onStatus('error', 'Deepgram refused the connection — check your API key')
          return
        }
      }
      this.events.onStatus('reconnecting')
      const delay = Math.min(8000, 500 * 2 ** this.retries++)
      this.reconnectTimer = window.setTimeout(() => {
        if (this.running) this.connect()
      }, delay)
    }
  }
}
