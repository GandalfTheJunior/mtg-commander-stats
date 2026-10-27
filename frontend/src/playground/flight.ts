// Arc-length parameterization keeps velocity bounded at every axis and corner.
export function railPoint(width: number, height: number, distance: number) {
  const inset = 15
  const w = Math.max(1, width - inset * 2), h = Math.max(1, height - inset * 2)
  const r = Math.min(w / 2, h / 2, width * .3)
  const bottom = Math.min(8, w / 2, h / 2)
  const straightX = w - 2 * r, straightY = h - r - bottom, arc = Math.PI * r / 2
  const bottomArc = Math.PI * bottom / 2, bottomX = w - 2 * bottom
  const perimeter = straightX + bottomX + 2 * straightY + 2 * arc + 2 * bottomArc
  let d = ((distance % 1) + 1) % 1 * perimeter
  const segments = [straightX, arc, straightY, bottomArc, bottomX, bottomArc, straightY, arc]
  for (let i = 0; i < segments.length; i++) {
    if (d > segments[i]) { d -= segments[i]; continue }
    if (i === 0) return { x: inset + r + d, y: inset }
    if (i === 2) return { x: inset + w, y: inset + r + d }
    if (i === 4) return { x: inset + w - bottom - d, y: inset + h }
    if (i === 6) return { x: inset, y: inset + h - bottom - d }
    const radius = i === 3 || i === 5 ? bottom : r
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][(i - 1) / 2] + d / radius
    const cx = i < 4 ? inset + w - radius : inset + radius
    const cy = i === 1 || i === 7 ? inset + radius : inset + h - radius
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }
  }
  return { x: inset + r, y: inset }
}
export const smooth = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p) }
export const random = (min: number, max: number) => min + Math.random() * (max - min)
