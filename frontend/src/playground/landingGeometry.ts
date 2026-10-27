export type OverlayPose = {
  left: number; top: number; width: number; height: number
  transform: string; transformOrigin: string; baseX: number; baseY: number
}

// Read the displayed overlay before React changes its drag state. CSS left/top
// are not necessarily viewport coordinates (rotation, visual viewport, ancestors).
export function measureOverlay(node: HTMLElement): OverlayPose {
  const style = getComputedStyle(node), rect = node.getBoundingClientRect()
  const width = parseFloat(style.width) || rect.width, height = parseFloat(style.height) || rect.height
  const [ox, oy] = style.transformOrigin.split(' ').map(Number.parseFloat)
  const originX = Number.isFinite(ox) ? ox : width / 2, originY = Number.isFinite(oy) ? oy : height / 2
  const transform = style.transform === 'none' || !style.transform ? 'matrix(1, 0, 0, 1, 0, 0)' : style.transform
  const matrix = typeof DOMMatrixReadOnly === 'undefined'
    ? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } : new DOMMatrixReadOnly(transform)
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => ({
    x: originX + matrix.a * (x - originX) + matrix.c * (y - originY) + matrix.e,
    y: originY + matrix.b * (x - originX) + matrix.d * (y - originY) + matrix.f,
  }))
  return { left: parseFloat(style.left) || 0, top: parseFloat(style.top) || 0, width, height,
    transform, transformOrigin: style.transformOrigin || '50% 50%',
    baseX: rect.left - Math.min(...corners.map(p => p.x)), baseY: rect.top - Math.min(...corners.map(p => p.y)) }
}

// Native scroll positions round to device/CSS pixels; measured edges stay fractional.
// A one-CSS-pixel tolerance prevents an edge-scroll stop becoming an invalid drop.
export function withinDropZone(x: number, y: number, bounds: DOMRect) {
  return x >= bounds.left - 1 && x <= bounds.right + 1 && y >= bounds.top - 1 && y <= bounds.bottom + 1
}
