import type { Settings } from '../config'
import { webSpeechAvailable } from '../audio/webspeech'

function sttCapabilityNote(): string {
  if (!webSpeechAvailable()) {
    return 'This browser has no Web Speech API — live mic needs a Deepgram key.'
  }
  return (
    'Web Speech API detected. It is only reliable in real Google Chrome; ' +
    'other Chromium-based browsers usually fail with a network error. ' +
    'A Deepgram key works in any modern browser.'
  )
}

async function populateMics(select: HTMLSelectElement, current: string): Promise<void> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
    select.length = 1 // keep "System default"
    mics.forEach((m, i) => {
      const opt = document.createElement('option')
      opt.value = m.deviceId
      // labels are blank until the user has granted mic permission once
      opt.textContent = m.label || `Microphone ${i + 1}`
      select.append(opt)
    })
    select.value = current
    if (select.value !== current) select.value = ''
  } catch {
    /* no device enumeration (permissions / API absent) — leave default */
  }
}

export function setupConfigDialog(
  dialog: HTMLDialogElement,
  get: () => Settings,
  onSave: (s: Settings) => void,
): { open(): void } {
  const form = dialog.querySelector<HTMLFormElement>('#config-form')!
  const capability = dialog.querySelector<HTMLElement>('#stt-capability')

  const fill = () => {
    const s = get()
    for (const [k, v] of Object.entries(s)) {
      const el = form.elements.namedItem(k)
      if (!el) continue
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v)
      else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = String(v)
    }
  }

  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return
    const s = { ...get() }
    const data = new FormData(form)
    s.sttBackend = (data.get('sttBackend') as Settings['sttBackend']) ?? s.sttBackend
    s.deepgramKey = String(data.get('deepgramKey') ?? '')
    s.micDeviceId = String(data.get('micDeviceId') ?? '')
    s.cloudDetector = (data.get('cloudDetector') as Settings['cloudDetector']) ?? s.cloudDetector
    s.pangramKey = String(data.get('pangramKey') ?? '')
    s.saplingKey = String(data.get('saplingKey') ?? '')
    s.relayUrl = String(data.get('relayUrl') ?? '')
    s.pollIntervalS = clamp(Number(data.get('pollIntervalS')), 10, 300, 20)
    s.windowWords = clamp(Number(data.get('windowWords')), 80, 1000, 250)
    s.replayWpm = clamp(Number(data.get('replayWpm')), 60, 400, 170)
    s.lexicalEnabled = data.get('lexicalEnabled') === 'on'
    s.sensitivity = clamp(Number(data.get('sensitivity')), 0.5, 2.5, 1)
    onSave(s)
  })

  // live readout for the sensitivity slider
  const slider = form.elements.namedItem('sensitivity')
  const sliderReadout = dialog.querySelector<HTMLElement>('#sensitivity-readout')
  const syncSliderReadout = (): void => {
    if (slider instanceof HTMLInputElement && sliderReadout) {
      sliderReadout.textContent = Number(slider.value).toFixed(2).replace(/0$/, '')
    }
  }
  if (slider instanceof HTMLInputElement) slider.addEventListener('input', syncSliderReadout)

  return {
    open() {
      fill()
      syncSliderReadout()
      if (capability) capability.textContent = sttCapabilityNote()
      void populateMics(
        form.elements.namedItem('micDeviceId') as HTMLSelectElement,
        get().micDeviceId,
      )
      dialog.showModal()
    },
  }
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}
