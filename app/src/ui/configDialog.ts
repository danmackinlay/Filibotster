import type { Settings } from '../config'

export function setupConfigDialog(
  dialog: HTMLDialogElement,
  get: () => Settings,
  onSave: (s: Settings) => void,
): { open(): void } {
  const form = dialog.querySelector<HTMLFormElement>('#config-form')!

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
    s.pangramKey = String(data.get('pangramKey') ?? '')
    s.relayUrl = String(data.get('relayUrl') ?? '')
    s.pollIntervalS = clamp(Number(data.get('pollIntervalS')), 10, 300, 20)
    s.windowWords = clamp(Number(data.get('windowWords')), 80, 1000, 250)
    s.replayWpm = clamp(Number(data.get('replayWpm')), 60, 400, 170)
    s.lexicalEnabled = data.get('lexicalEnabled') === 'on'
    s.pangramEnabled = data.get('pangramEnabled') === 'on'
    onSave(s)
  })

  return {
    open() {
      fill()
      dialog.showModal()
    },
  }
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}
