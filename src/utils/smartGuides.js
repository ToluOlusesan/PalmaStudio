// Smart guides: while dragging, snap the moving selection's left/centre/right
// and top/middle/bottom to the same lines on other items, Figma-style. Returns
// the correction to apply plus the guide segments to draw (canvas coords).
const xs = (b) => [b.x, b.x + b.w / 2, b.x + b.w]
const ys = (b) => [b.y, b.y + b.h / 2, b.y + b.h]

export function snapToGuides(box, others, threshold) {
  let bestX = null
  let bestY = null
  const mx = xs(box)
  const my = ys(box)
  for (const o of others) {
    for (const ox of xs(o)) for (const v of mx) {
      const d = ox - v
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: ox }
    }
    for (const oy of ys(o)) for (const v of my) {
      const d = oy - v
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: oy }
    }
  }
  const dx = bestX ? bestX.d : 0
  const dy = bestY ? bestY.d : 0
  const snapped = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h }
  const guides = []
  // Span each guide across everything sitting on that line, plus the box.
  if (bestX) {
    const on = others.filter((o) => xs(o).some((v) => Math.abs(v - bestX.pos) < 0.5))
    const top = Math.min(snapped.y, ...on.map((o) => o.y))
    const bottom = Math.max(snapped.y + snapped.h, ...on.map((o) => o.y + o.h))
    guides.push({ axis: 'x', pos: bestX.pos, from: top, to: bottom })
  }
  if (bestY) {
    const on = others.filter((o) => ys(o).some((v) => Math.abs(v - bestY.pos) < 0.5))
    const left = Math.min(snapped.x, ...on.map((o) => o.x))
    const right = Math.max(snapped.x + snapped.w, ...on.map((o) => o.x + o.w))
    guides.push({ axis: 'y', pos: bestY.pos, from: left, to: right })
  }
  return { dx, dy, snapX: !!bestX, snapY: !!bestY, guides }
}
