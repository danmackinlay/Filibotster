export interface Settings {
  sttBackend: 'auto' | 'deepgram' | 'webspeech'
  deepgramKey: string
  micDeviceId: string
  pangramKey: string
  relayUrl: string
  pollIntervalS: number
  windowWords: number
  lexicalEnabled: boolean
  pangramEnabled: boolean
  replayWpm: number
}

export const DEFAULTS: Settings = {
  sttBackend: 'auto',
  deepgramKey: '',
  micDeviceId: '',
  pangramKey: '',
  relayUrl: '',
  pollIntervalS: 20,
  windowWords: 250,
  lexicalEnabled: true,
  pangramEnabled: true,
  replayWpm: 170,
}

const KEY = 'filibotster.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
