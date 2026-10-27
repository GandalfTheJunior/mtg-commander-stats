export const smooth = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p) }
export const random = (min: number, max: number) => min + Math.random() * (max - min)
export type Point = { x: number; y: number }
export type Region = { left: number; top: number; width: number; height: number }

// CSS-pixel travel budgets couple distance, halo, brightness and apparent speed.
// Non-overlapping speed bands preserve the depth hierarchy despite individual variation.
export const depths = [
  { name: 'far', radius: .75, halo: 2.4, brightness: .58, speed: [2, 2.6] },
  { name: 'mid', radius: 1.15, halo: 3, brightness: .8, speed: [4.3, 5.2] },
  { name: 'near', radius: 1.65, halo: 3.7, brightness: 1, speed: [8, 9.5] },
] as const

// Upper exterior pockets clear the arch, vertical/horizontal glazing bars and
// measured HTML caption (including font/viewport changes). SVG clip is a second guard.
export function exteriorRegions(width: number, height: number, captionTop: number): Region[] {
  const top = height * .24
  const bottom = Math.min(height * .46, captionTop - 14)
  if (width <= 0 || bottom <= top + 16) return []
  return [.21, .57].map(left => ({ left: width * left, top, width: width * .22, height: bottom - top }))
}
export function pointIn(region: Region): Point {
  return { x: region.left + random(.08, .92) * region.width, y: region.top + random(.08, .92) * region.height }
}
export function curve(from: Point, control: Point, to: Point, t: number): Point {
  const u = smooth(t), v = 1 - u
  return { x: v * v * from.x + 2 * v * u * control.x + u * u * to.x, y: v * v * from.y + 2 * v * u * control.y + u * u * to.y }
}
export function flightDuration(from: Point, control: Point, to: Point, speed: number) {
  return Math.max(1600, (Math.hypot(control.x - from.x, control.y - from.y) + Math.hypot(to.x - control.x, to.y - control.y)) / speed * 1000)
}

export function nextFlight(region: Region, from: Point) {
  let to = pointIn(region)
  const minimum = Math.hypot(region.width, region.height) * .3
  for (let i = 0; i < 8 && Math.hypot(to.x - from.x, to.y - from.y) < minimum; i++) to = pointIn(region)
  if (Math.hypot(to.x - from.x, to.y - from.y) < minimum) {
    to = { x: region.left + region.width * (from.x < region.left + region.width / 2 ? .9 : .1), y: region.top + region.height * (from.y < region.top + region.height / 2 ? .9 : .1) }
  }
  const bend = random(-.25, .25)
  const control = {
    x: Math.max(region.left, Math.min(region.left + region.width, (from.x + to.x) / 2 - (to.y - from.y) * bend)),
    y: Math.max(region.top, Math.min(region.top + region.height, (from.y + to.y) / 2 + (to.x - from.x) * bend)),
  }
  return { control, to }
}
