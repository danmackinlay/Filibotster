import './style.css'
import { loadSettings, saveSettings, type Settings } from './config'
import type { SttEvents, SttSource, SttStatus } from './audio/stt'
import { ReplaySource } from './audio/replay'
import { WebSpeechSource, webSpeechAvailable } from './audio/webspeech'
import { DeepgramSource } from './audio/deepgram'
import { TranscriptStore } from './transcript/store'
import { lexicalScore } from './detectors/lexical'
import { PangramClient, PangramError, CREDIT_USD, MIN_WORDS } from './detectors/pangram'
import { Needle } from './detectors/fusion'
import { createDial } from './ui/dial'
import { Subtitles } from './ui/subtitles'
import { Diagnostics } from './ui/diagnostics'
import { setupConfigDialog } from './ui/configDialog'
import { DEMO_SPEECH } from './demo-speech'

// ---------- state ----------
let settings: Settings = loadSettings()
const store = new TranscriptStore()
const needle = new Needle()
let source: SttSource | null = null
let startCurrentSource: (() => void) | null = null
let paused = false

// ---------- elements ----------
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const overlay = $('#overlay')
const dialStage = $('#dial-stage')
const readoutScore = $('#readout-score')
const readoutHeadline = $('#readout-headline')
const pillStt = $('#pill-stt')
const pillPangram = $('#pill-pangram')
const banner = $('#banner')

const dial = createDial($('#dial-mount'))
const subtitles = new Subtitles($('#subtitle-text'))
const diagnostics = new Diagnostics($('#diagnostics'))
const configDialog = setupConfigDialog(
  document.querySelector<HTMLDialogElement>('#config-dialog')!,
  () => settings,
  (s) => {
    settings = s
    saveSettings(s)
    updatePangramPill()
  },
)

// ---------- STT wiring ----------
const sttEvents: SttEvents = {
  onInterim: (text) => {
    if (!paused) subtitles.setInterim(text)
  },
  onFinal: (text) => {
    if (!paused) {
      store.appendFinal(text)
      subtitles.addFinal(text)
    }
  },
  onStatus: (status: SttStatus, detail?: string) => {
    pillStt.dataset.state = status
    pillStt.textContent = `STT: ${status.toUpperCase()}${detail ? ` (${detail})` : ''}`
    if (status === 'error' && detail) showBanner(`STT: ${detail}`)
  },
}

function switchSource(make: () => SttSource): void {
  source?.stop()
  const next = make()
  source = next
  startCurrentSource = () => void next.start().catch(() => {})
  startCurrentSource()
  overlay.classList.add('hidden')
  paused = false
}

function startReplay(): void {
  switchSource(() => new ReplaySource(DEMO_SPEECH, settings.replayWpm, sttEvents))
}

function startMic(): void {
  const useDeepgram =
    settings.sttBackend === 'deepgram' ||
    (settings.sttBackend === 'auto' && settings.deepgramKey.length > 0)
  if (useDeepgram) {
    switchSource(
      () => new DeepgramSource(settings.deepgramKey, sttEvents, settings.micDeviceId || undefined),
    )
  } else if (webSpeechAvailable()) {
    switchSource(() => new WebSpeechSource(sttEvents))
  } else {
    showBanner('No speech recognition available — this browser lacks the Web Speech API and no Deepgram key is set')
  }
}

// ---------- calibration ----------
// The trim screw: raw detector scores are raised to 1/sensitivity before
// driving the needle. 1 = honest; >1 amplifies weak evidence.
const calibrate = (raw: number): number =>
  Math.pow(Math.max(0, Math.min(1, raw)), 1 / settings.sensitivity)

// ---------- lexical detector ----------
store.onChange(() => {
  if (!settings.lexicalEnabled) {
    needle.setLexical(0)
    return
  }
  const result = lexicalScore(store.windowText(settings.windowWords))
  needle.setLexical(calibrate(result.score))
  diagnostics.set({
    lexical: `${Math.round(result.score * 100)} · ${result.hitsPer100.toFixed(1)}/100w`,
    hits: result.topHits.join(', '),
    words: store.wordCount,
  })
})

// ---------- Pangram scheduler ----------
// When the app is served by the relay Worker itself (the default deployment),
// an empty relay URL means "this same origin".
const pangram = new PangramClient(
  () => settings.relayUrl.trim() || location.origin,
  () => settings.pangramKey,
)
let pangramInFlight = false
let lastScanAt = 0
let lastScanWords = 0
let backoffUntil = 0

function updatePangramPill(state?: string, label?: string): void {
  if (state) {
    pillPangram.dataset.state = state
    pillPangram.textContent = `PANGRAM: ${label ?? state.toUpperCase()}`
  } else if (!settings.pangramEnabled || !pangram.configured) {
    pillPangram.dataset.state = 'off'
    pillPangram.textContent = pangram.configured ? 'PANGRAM: OFF' : 'PANGRAM: NO KEY'
  }
}
updatePangramPill()

async function maybeScanPangram(): Promise<void> {
  const now = Date.now()
  if (
    !settings.pangramEnabled ||
    !pangram.configured ||
    !source ||
    paused ||
    pangramInFlight ||
    now < backoffUntil ||
    now - lastScanAt < settings.pollIntervalS * 1000 ||
    store.wordCount < MIN_WORDS ||
    store.wordCount - lastScanWords < 20
  ) {
    return
  }
  pangramInFlight = true
  updatePangramPill('connecting', 'SCANNING')
  try {
    const verdict = await pangram.scan(store.windowText(settings.windowWords))
    lastScanAt = Date.now()
    lastScanWords = store.wordCount
    needle.setPangram(calibrate(verdict.score))
    readoutHeadline.textContent = verdict.headline
    updatePangramPill('live', `${Math.round(verdict.score * 100)}`)
    diagnostics.set({
      pangram: `${Math.round(verdict.score * 100)} · ai ${verdict.fractionAi.toFixed(2)}`,
      rtt: `${verdict.rttMs} ms`,
      creditsUsd: pangram.creditsSpent * CREDIT_USD,
    })
  } catch (err) {
    lastScanAt = Date.now()
    const e = err instanceof PangramError ? err : new PangramError(0, String(err))
    updatePangramPill('error', 'ERROR')
    showBanner(`Pangram: ${e.message}`)
    if (e.status === 429 || e.status === 402) {
      backoffUntil = Date.now() + 2 * settings.pollIntervalS * 1000
    }
    diagnostics.set({ creditsUsd: pangram.creditsSpent * CREDIT_USD })
  } finally {
    pangramInFlight = false
  }
}
setInterval(() => void maybeScanPangram(), 1000)

// ---------- render loop ----------
// rAF drives the needle while visible; browsers pause rAF in hidden tabs, so
// the telemetry interval below sub-steps the physics whenever we're hidden.
let lastStep = performance.now()

function stepAndRender(now: number, maxDt: number): void {
  let remaining = Math.min(maxDt, (now - lastStep) / 1000)
  lastStep = now
  let pos = needle.value
  while (remaining > 0) {
    const dt = Math.min(0.05, remaining)
    pos = needle.step(dt)
    remaining -= dt
  }
  dial.update(pos)
  readoutScore.textContent = String(Math.round(needle.value * 100)).padStart(2, '0')
  dialStage.classList.toggle('in-the-red', needle.value >= 0.8)
}

function frame(now: number): void {
  stepAndRender(now, 0.1)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// slow telemetry tick
setInterval(() => {
  if (document.hidden) stepAndRender(performance.now(), 2)
  needle.setWpm(source && !paused ? store.wpm() : 0)
  diagnostics.set({ wpm: store.wpm() })
  diagnostics.pushScore(needle.value)
}, 500)

// ---------- banner ----------
let bannerTimer: number | undefined
function showBanner(msg: string): void {
  banner.textContent = msg
  banner.hidden = false
  if (bannerTimer !== undefined) clearTimeout(bannerTimer)
  bannerTimer = window.setTimeout(() => (banner.hidden = true), 6000)
}

// ---------- controls ----------
$('#btn-replay').addEventListener('click', startReplay)
$('#btn-mic').addEventListener('click', startMic)
$('#btn-config').addEventListener('click', () => configDialog.open())

// ?demo auto-starts the replay (shareable demo link, headless screenshots);
// ?demo=slop pre-warms the window with the speech's slop section so the
// needle heads for the red immediately.
{
  const demo = new URLSearchParams(location.search).get('demo')
  if (demo !== null) {
    startReplay()
    if (demo === 'slop') {
      const slopSection = DEMO_SPEECH.slice(DEMO_SPEECH.indexOf('Furthermore'))
      store.appendFinal(slopSection.replace(/\s+/g, ' ').trim())
      needle.snap()
    }
  }
}

if (import.meta.env.DEV) {
  // console handle for poking the pipeline during development
  ;(window as unknown as Record<string, unknown>).__fili = { store, needle, subtitles }
}

document.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return
  switch (ev.key) {
    case 'f':
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen()
      break
    case 'd':
      diagnostics.toggle()
      break
    case ',':
      configDialog.open()
      break
    case 'r':
      startReplay()
      break
    case ' ':
      ev.preventDefault()
      if (!source) break
      paused = !paused
      if (paused) {
        source.stop()
        pillStt.dataset.state = 'off'
        pillStt.textContent = 'STT: PAUSED'
      } else {
        startCurrentSource?.()
      }
      break
  }
})
