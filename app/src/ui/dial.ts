/**
 * The slop-o-meter: a vintage broadcast-VU-style gauge rendered as SVG.
 * Score 0..1 maps to needle angle -90°..+90°.
 */

const CX = 500
const CY = 560
const NS = 'http://www.w3.org/2000/svg'

const rad = (deg: number) => (deg * Math.PI) / 180
const px = (r: number, a: number) => CX + r * Math.sin(rad(a))
const py = (r: number, a: number) => CY - r * Math.cos(rad(a))

function arcPath(r: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${px(r, a0)} ${py(r, a0)} A ${r} ${r} 0 ${large} 1 ${px(r, a1)} ${py(r, a1)}`
}

const ZONE_LABELS: Array<[number, string]> = [
  [-72, 'ARTISANAL'],
  [-36, 'FREE-RANGE'],
  [0, 'FOCUS-GROUPED'],
  [36, 'REHEATED'],
  [72, 'PURE SLOP'],
]

export interface Dial {
  /** pos: needle position 0..1 */
  update(pos: number): void
}

export function createDial(mount: HTMLElement): Dial {
  let ticks = ''
  for (let i = 0; i <= 50; i++) {
    const a = -90 + i * 3.6
    const major = i % 5 === 0
    const r0 = major ? 424 : 436
    ticks += `<line x1="${px(r0, a)}" y1="${py(r0, a)}" x2="${px(448, a)}" y2="${py(448, a)}"
      stroke="var(--ink)" stroke-width="${major ? 3.5 : 1.5}" />`
  }

  let numerals = ''
  for (let i = 0; i <= 10; i++) {
    const a = -90 + i * 18
    numerals += `<text x="${px(398, a)}" y="${py(398, a)}" class="dial-numeral"
      transform="rotate(${a} ${px(398, a)} ${py(398, a)})">${i * 10}</text>`
  }

  let zoneLabels = ''
  for (const [a, label] of ZONE_LABELS) {
    zoneLabels += `<text x="${px(330, a)}" y="${py(330, a)}" class="dial-zone-label"
      transform="rotate(${a} ${px(330, a)} ${py(330, a)})">${label}</text>`
  }

  mount.innerHTML = `
  <svg viewBox="0 0 1000 640" xmlns="${NS}" id="dial-svg" role="img"
       aria-label="Slop meter dial">
    <defs>
      <radialGradient id="face-age" cx="50%" cy="80%" r="90%">
        <stop offset="0%" stop-color="var(--cream)" />
        <stop offset="78%" stop-color="var(--cream)" />
        <stop offset="100%" stop-color="var(--cream-edge)" />
      </radialGradient>
      <radialGradient id="hub-brass" cx="38%" cy="34%" r="80%">
        <stop offset="0%" stop-color="#d8bd85" />
        <stop offset="55%" stop-color="var(--brass)" />
        <stop offset="100%" stop-color="#6e5527" />
      </radialGradient>
      <filter id="needle-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>

    <!-- face card -->
    <rect x="36" y="26" width="928" height="588" rx="22" fill="url(#face-age)"
          stroke="var(--ink)" stroke-width="2.5" />
    <rect x="46" y="36" width="908" height="568" rx="16" fill="none"
          stroke="var(--ink)" stroke-opacity="0.25" stroke-width="1" />

    <!-- corner screws -->
    ${[
      [72, 62],
      [928, 62],
      [72, 578],
      [928, 578],
    ]
      .map(
        ([x, y], i) => `
      <circle cx="${x}" cy="${y}" r="13" fill="url(#hub-brass)" stroke="#3a2d15" stroke-width="1.5"/>
      <line x1="${x - 8}" y1="${y}" x2="${x + 8}" y2="${y}" stroke="#3a2d15" stroke-width="2.5"
            transform="rotate(${[23, 71, 128, 12][i]} ${x} ${y})"/>`,
      )
      .join('')}

    <!-- scale bands: calm ink → amber → red -->
    <path d="${arcPath(430, -90, 18)}" stroke="var(--ink)" stroke-width="6" fill="none"/>
    <path d="${arcPath(430, 18, 54)}" stroke="var(--amber)" stroke-width="22" fill="none"/>
    <path d="${arcPath(430, 54, 90)}" stroke="var(--red)" stroke-width="22" fill="none"/>

    ${ticks}
    ${numerals}
    ${zoneLabels}

    <!-- maker's marks -->
    <text x="${CX}" y="300" class="dial-brand">SLOP·O·METER</text>
    <text x="${CX}" y="336" class="dial-brand-sub">FILIBOTSTER INSTRUMENT Co.</text>
    <text x="${CX}" y="600" class="dial-fine">MODEL M1 · CAL. 2026-07 · READS 10–30 s BEHIND THE PODIUM</text>

    <!-- needle -->
    <g id="needle" filter="url(#needle-shadow)">
      <polygon points="${CX},${CY - 452} ${CX + 7},${CY + 26} ${CX - 7},${CY + 26}"
               fill="var(--needle)" />
      <polygon points="${CX},${CY - 452} ${CX + 3.5},${CY - 330} ${CX - 3.5},${CY - 330}"
               fill="var(--red)" />
    </g>
    <circle cx="${CX}" cy="${CY}" r="30" fill="url(#hub-brass)" stroke="#3a2d15" stroke-width="2"/>
    <line x1="${CX - 17}" y1="${CY}" x2="${CX + 17}" y2="${CY}" stroke="#3a2d15" stroke-width="4"
          transform="rotate(31 ${CX} ${CY})"/>
  </svg>`

  const needle = mount.querySelector<SVGGElement>('#needle')!

  return {
    update(pos: number) {
      const angle = -90 + pos * 180
      needle.setAttribute('transform', `rotate(${angle} ${CX} ${CY})`)
    },
  }
}
