import './style.css'
import { loadSettings, saveSettings, type Settings } from './config'
import type { SttEvents, SttSource, SttStatus } from './audio/stt'
import { ReplaySource } from './audio/replay'
import { WebSpeechSource, webSpeechAvailable } from './audio/webspeech'
import { DeepgramSource } from './audio/deepgram'
import { TranscriptStore } from './transcript/store'
import { lexicalScore } from './detectors/lexical'
import { PangramClient, MIN_WORDS } from './detectors/pangram'
import { SaplingClient } from './detectors/sapling'
import { DetectorError, type CloudDetector } from './detectors/types'
import { shouldScan } from './detectors/schedule'
import { Needle } from './detectors/fusion'
import { createDial } from './ui/dial'
import { Subtitles } from './ui/subtitles'
import { Diagnostics } from './ui/diagnostics'
import { setupConfigDialog } from './ui/configDialog'
import { labelFor } from './slop-labels'
import { DEMO_SPEECH } from './demo-speech'

// ---------- state ----------
let settings: Settings = loadSettings()
const store = new TranscriptStore()
const needle = new Needle()
let source: SttSource | null = null
let currentFactory: (() => SttSource) | null = null
let powered = false

// ---------- elements ----------
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const overlay = $('#overlay')
const dialStage = $('#dial-stage')
const readoutScore = $('#readout-score')
const readoutHeadline = $('#readout-headline')
const readoutFreshness = $('#readout-freshness')
const btnPower = $('#btn-power')
const pillStt = $('#pill-stt')
const pillCloud = $('#pill-cloud')
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
    updateCloudPill()
  },
)

// ---------- STT wiring ----------
const sttEvents: SttEvents = {
  onInterim: (text) => {
    if (powered) subtitles.setInterim(text)
  },
  onFinal: (text) => {
    if (powered) {
      store.appendFinal(text)
      subtitles.addFinal(text)
    }
  },
  onStatus: (status: SttStatus, detail?: string) => {
    pillStt.dataset.state = status
    // Once live, naming the source beats repeating "LIVE" — the green pill
    // already says live — and it keeps the label inside the pill's fixed width.
    const label = status === 'live' && detail ? detail : status
    pillStt.textContent = `MIC: ${label.toUpperCase()}`
    if (status === 'error' && detail) showBanner(`MIC: ${detail}`)
  },
}

function switchSource(make: () => SttSource): void {
  source?.stop()
  currentFactory = make
  source = make()
  void source.start().catch(() => {})
  overlay.classList.add('hidden')
  powered = true
  updatePowerUi()
}

function powerOff(): void {
  powered = false
  source?.stop()
  // needle spirals down to zero; nothing is scored, no tokens burn
  needle.setLexical(0)
  needle.setCloud(null)
  needle.setWpm(0)
  readoutHeadline.textContent = ''
  updateCloudPill()
  updatePowerUi()
}

function togglePower(): void {
  if (powered) {
    powerOff()
  } else if (currentFactory) {
    switchSource(currentFactory)
  } else {
    overlay.classList.remove('hidden')
  }
}

function updatePowerUi(): void {
  btnPower.dataset.on = String(powered)
  btnPower.textContent = powered ? '● LIVE' : '○ STANDBY'
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

// ---------- cloud detector scheduler ----------
// Swappable verdict backend: Pangram (via the relay; an empty relay URL means
// "this same origin" on the default deployment) or Sapling (browser-direct).
const pangram = new PangramClient(
  () => settings.relayUrl.trim() || location.origin,
  () => settings.pangramKey,
)
const sapling = new SaplingClient(() => settings.saplingKey)

// The selected backend, or null when cloud detection is off. Both clients
// satisfy CloudDetector, so the scheduler below never special-cases which one.
function activeCloud(): CloudDetector | null {
  switch (settings.cloudDetector) {
    case 'pangram':
      return pangram
    case 'sapling':
      return sapling
    default:
      return null
  }
}

const cloudLabel = (): string => settings.cloudDetector.toUpperCase()
const cloudConfigured = (): boolean => activeCloud()?.configured ?? false
// Summed across both clients so switching backend mid-session keeps the tally.
const cloudCostUsd = (): number => pangram.costUsd + sapling.costUsd

let cloudInFlight = false
let lastScanAt = 0
let lastScanWords = 0
let backoffUntil = 0
// dispatch/freshness telemetry: when we last sent a window and what stretch
// of real speech time that window covered
let dispatchSpan: { from: number; to: number } | null = null
let verdictAt = 0
let verdictSpan: { from: number; to: number } | null = null

function updateCloudPill(state?: string, label?: string): void {
  if (state) {
    pillCloud.dataset.state = state
    pillCloud.textContent = `${cloudLabel()}: ${label ?? state.toUpperCase()}`
  } else if (settings.cloudDetector === 'none') {
    pillCloud.dataset.state = 'off'
    pillCloud.textContent = 'DETECTOR: OFF'
  } else {
    pillCloud.dataset.state = 'off'
    pillCloud.textContent = `${cloudLabel()}: ${cloudConfigured() ? 'IDLE' : 'NO KEY'}`
  }
}
updateCloudPill()

async function maybeScanCloud(): Promise<void> {
  const now = Date.now()
  const detector = activeCloud()
  const gateOpen = shouldScan({
    configured: detector?.configured ?? false,
    powered,
    inFlight: cloudInFlight,
    now,
    backoffUntil,
    lastScanAt,
    pollIntervalMs: settings.pollIntervalS * 1000,
    minWords: MIN_WORDS,
    wordCount: store.wordCount,
    wordCountAtLastScan: lastScanWords,
  })
  if (!detector || !gateOpen) return
  cloudInFlight = true
  dispatchSpan = store.windowSpan(settings.windowWords)
  readoutFreshness.classList.add('dispatched')
  setTimeout(() => readoutFreshness.classList.remove('dispatched'), 1200)
  updateCloudPill('connecting', 'SCANNING')
  try {
    const verdict = await detector.scan(store.windowText(settings.windowWords))
    lastScanAt = Date.now()
    lastScanWords = store.wordCount
    verdictAt = Date.now()
    verdictSpan = dispatchSpan
    needle.setCloud(calibrate(verdict.score))
    // Pangram ships its own headline; Sapling doesn't, so fall back to label + detail.
    readoutHeadline.textContent = verdict.headline || `${cloudLabel()} · ${verdict.detail ?? ''}`
    updateCloudPill('live', `${Math.round(verdict.score * 100)}`)
    diagnostics.set({
      cloud: `${Math.round(verdict.score * 100)} · ${verdict.detail ?? ''}`,
      rtt: `${verdict.rttMs} ms`,
      creditsUsd: cloudCostUsd(),
    })
  } catch (err) {
    lastScanAt = Date.now()
    const status = err instanceof DetectorError ? err.status : 0
    const msg = err instanceof Error ? err.message : String(err)
    updateCloudPill('error', 'ERROR')
    showBanner(`${cloudLabel()}: ${msg}`)
    if (status === 429 || status === 402) {
      backoffUntil = Date.now() + 2 * settings.pollIntervalS * 1000
    }
    diagnostics.set({ creditsUsd: cloudCostUsd() })
  } finally {
    cloudInFlight = false
  }
}
setInterval(() => void maybeScanCloud(), 1000)

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
const ago = (t: number) => `${Math.max(0, Math.round((Date.now() - t) / 1000))}s`

// The "no detector yet" line is the one bit of telemetry that asks the user to
// do something, so it carries a real button rather than a bare "(,)" hint. The
// node is built once and re-attached, so the click listener survives the
// twice-a-second re-render below.
const freshnessAction = document.createElement('button')
freshnessAction.type = 'button'
freshnessAction.className = 'freshness-action'
freshnessAction.textContent = 'add a detector key'
freshnessAction.addEventListener('click', () => configDialog.open())

// This runs 2×/s. Without the guard the plain-text branches would replace the
// text node every tick (dropping any selection the user has made), and the
// action branch would re-attach the button mid-click.
let lastFreshness = ''
let lastFreshnessHadAction = false

function setFreshness(text: string, withAction = false): void {
  if (lastFreshness === text && lastFreshnessHadAction === withAction) return
  lastFreshness = text
  lastFreshnessHadAction = withAction
  if (withAction) readoutFreshness.replaceChildren(document.createTextNode(text), freshnessAction)
  else readoutFreshness.textContent = text
}

function renderFreshness(): void {
  if (!powered) {
    setFreshness('STANDBY — nothing is scored, no credits burn')
    return
  }
  if (!cloudConfigured()) {
    setFreshness('free slop-word meter only — ', true)
    return
  }
  if (cloudInFlight && dispatchSpan) {
    setFreshness(`◉ scoring speech from ${ago(dispatchSpan.from)} to ${ago(dispatchSpan.to)} ago`)
    return
  }
  if (verdictAt && verdictSpan) {
    setFreshness(
      `verdict ${ago(verdictAt)} ago · scored speech from ${ago(verdictSpan.from)} to ${ago(verdictSpan.to)} ago`,
    )
    return
  }
  setFreshness('warming up — needs a few more words before the first scan')
}

// The cloud verdict owns the headline whenever a detector is configured
// (maybeScanCloud writes its own wording there). In the free default it would
// otherwise sit permanently blank, so name the zone the needle is pointing at.
function renderHeadline(): void {
  if (cloudConfigured()) return
  const text = powered ? labelFor(needle.value) : ''
  if (readoutHeadline.textContent !== text) readoutHeadline.textContent = text
}

setInterval(() => {
  if (document.hidden) stepAndRender(performance.now(), 2)
  needle.setWpm(powered ? store.wpm() : 0)
  diagnostics.set({ wpm: store.wpm() })
  diagnostics.pushScore(needle.value)
  renderFreshness()
  renderHeadline()
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
btnPower.addEventListener('click', togglePower)

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
    case 's':
    case ',': // legacy alias; `s` is the documented one
      configDialog.open()
      break
    case 'r':
      startReplay()
      break
    case ' ':
      ev.preventDefault()
      togglePower()
      break
  }
})
