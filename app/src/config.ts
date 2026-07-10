export type CloudDetector = 'none' | 'pangram' | 'sapling'

export interface Settings {
  sttBackend: 'auto' | 'deepgram' | 'webspeech'
  deepgramKey: string
  micDeviceId: string
  /** Which paid verdict backend drives the needle (lexical is independent). */
  cloudDetector: CloudDetector
  pangramKey: string
  saplingKey: string
  relayUrl: string
  pollIntervalS: number
  windowWords: number
  lexicalEnabled: boolean
  /** Needle calibration: detector scores are raised to 1/sensitivity.
   *  1 = honest, >1 = more dramatic, <1 = stricter. */
  sensitivity: number
  replayWpm: number
}

export const DEFAULTS: Settings = {
  sttBackend: 'auto',
  deepgramKey: '',
  micDeviceId: '',
  cloudDetector: 'pangram',
  pangramKey: '',
  saplingKey: '',
  relayUrl: '',
  pollIntervalS: 20,
  windowWords: 250,
  lexicalEnabled: true,
  sensitivity: 1,
  replayWpm: 170,
}

const KEY = 'filibotster.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const stored = JSON.parse(raw) as Partial<Settings> & { pangramEnabled?: boolean }
    const merged: Settings = { ...DEFAULTS, ...stored }
    // migrate pre-cloudDetector settings (pangramEnabled checkbox era)
    if (stored.cloudDetector === undefined && stored.pangramEnabled === false) {
      merged.cloudDetector = 'none'
    }
    delete (merged as unknown as Record<string, unknown>).pangramEnabled
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
