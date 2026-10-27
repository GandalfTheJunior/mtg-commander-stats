// Arc-length parameterization keeps velocity bounded at every axis and corner.
export function railPoint(width: number, height: number, distance: number) {
  const inset = 15
  const w = Math.max(1, width - inset * 2), h = Math.max(1, height - inset * 2)
  const r = Math.min(w / 2, h / 2, width * .25)
  const straightX = w - 2 * r, straightY = h - 2 * r, arc = Math.PI * r / 2
  const perimeter = 2 * (straightX + straightY) + 4 * arc
  let d = ((distance % 1) + 1) % 1 * perimeter
  const segments = [straightX, arc, straightY, arc, straightX, arc, straightY, arc]
  for (let i = 0; i < segments.length; i++) {
    if (d > segments[i]) { d -= segments[i]; continue }
    if (i === 0) return { x: inset + r + d, y: inset }
    if (i === 2) return { x: inset + w, y: inset + r + d }
    if (i === 4) return { x: inset + w - r - d, y: inset + h }
    if (i === 6) return { x: inset, y: inset + h - r - d }
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][(i - 1) / 2] + d / r
    const cx = i < 4 ? inset + w - r : inset + r
    const cy = i === 1 || i === 7 ? inset + r : inset + h - r
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  return { x: inset + r, y: inset }
}
export const smooth = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p) }
export const random = (min: number, max: number) => min + Math.random() * (max - min)
