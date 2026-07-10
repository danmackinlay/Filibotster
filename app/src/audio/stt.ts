export type SttStatus = 'off' | 'connecting' | 'live' | 'reconnecting' | 'error'

export interface SttEvents {
  onInterim(text: string): void
  onFinal(text: string): void
  onStatus(status: SttStatus, detail?: string): void
}

export interface SttSource {
  readonly name: string
  start(): Promise<void>
  stop(): void
}
