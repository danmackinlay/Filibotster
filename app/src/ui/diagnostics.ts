interface DiagFields {
  wpm?: number
  words?: number
  lexical?: string
  cloud?: string
  rtt?: string
  creditsUsd?: number
  hits?: string
}

const SPARK_LEN = 110

export class Diagnostics {
  private history: number[] = []
  private canvas: HTMLCanvasElement

  constructor(private root: HTMLElement) {
    this.canvas = root.querySelector('#diag-spark')!
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden
  }

  set(f: DiagFields): void {
    const put = (id: string, v: string) => {
      const el = this.root.querySelector(`#${id}`)
      if (el) el.textContent = v
    }
    if (f.wpm !== undefined) put('diag-wpm', String(f.wpm))
    if (f.words !== undefined) put('diag-words', String(f.words))
    if (f.lexical !== undefined) put('diag-lexical', f.lexical)
    if (f.cloud !== undefined) put('diag-cloud', f.cloud)
    if (f.rtt !== undefined) put('diag-rtt', f.rtt)
    if (f.creditsUsd !== undefined) put('diag-credits', `$${f.creditsUsd.toFixed(2)}`)
    if (f.hits !== undefined) put('diag-hits', f.hits || '–')
  }

  pushScore(score: number): void {
    this.history.push(score)
    if (this.history.length > SPARK_LEN) this.history.shift()
    this.drawSpark()
  }

  private drawSpark(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const { width: w, height: h } = this.canvas
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--amber') || '#c98a2c'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    this.history.forEach((s, i) => {
      const x = (i / (SPARK_LEN - 1)) * w
      const y = h - 3 - s * (h - 6)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
}
