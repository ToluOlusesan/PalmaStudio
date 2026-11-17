// Connector geometry (canvas coords). Each end leaves its item square to a side
// (auto-picked from where the other item sits), so links read as deliberate
// splines like Miro/Xmind rather than ray-cast lines.
//   style: 'curve' (cubic) | 'elbow' (orthogonal, rounded) | 'straight'
//   bend:  perpendicular offset (canvas px) applied at the middle of the path
const NORMAL = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }

export function anchor(it, side) {
  const cx = it.x + it.width / 2
  const cy = it.y + it.height / 2
  if (side === 'left') return { x: it.x, y: cy }
  if (side === 'right') return { x: it.x + it.width, y: cy }
  if (side === 'top') return { x: cx, y: it.y }
  return { x: cx, y: it.y + it.height }
}

// Pick facing sides. Horizontal wins unless the items overlap horizontally.
export function autoSides(a, b) {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2)
  const dy = b.y + b.height / 2 - (a.y + a.height / 2)
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height))
  if (gapX >= gapY) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

const sideOfPoint = (it, p) => {
  const d = [
    ['left', Math.abs(p.x - it.x)],
    ['right', Math.abs(p.x - (it.x + it.width))],
    ['top', Math.abs(p.y - it.y)],
    ['bottom', Math.abs(p.y - (it.y + it.height))],
  ]
  return d.sort((m, n) => m[1] - n[1])[0][0]
}

const bez = (p0, c1, c2, p1, t) => {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  }
}

// Rounded orthogonal polyline → SVG path.
function roundedPath(pts, r = 12) {
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]
    const c = pts[i]
    const n = pts[i + 1]
    const r1 = Math.min(r, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(n.x - c.x, n.y - c.y) / 2)
    const a = { x: c.x + Math.sign(p.x - c.x) * r1, y: c.y + Math.sign(p.y - c.y) * r1 }
    const b = { x: c.x + Math.sign(n.x - c.x) * r1, y: c.y + Math.sign(n.y - c.y) * r1 }
    d += ` L ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`
  }
  const last = pts[pts.length - 1]
  return d + ` L ${last.x} ${last.y}`
}

// Full geometry for an edge between items a and b (or a and a free point).
// Returns { d, points (sampled polyline for hit/label/handle), p1, p2 }.
export function connectorGeometry(a, b, edge = {}) {
  const style = edge.style || 'curve'
  const bend = edge.bend || 0
  let s1, s2, p1, p2
  if (b.width === undefined) {
    // Dragging to a free point: leave a from the side facing it.
    const fake = { x: b.x, y: b.y, width: 0, height: 0 }
    ;[s1] = autoSides(a, fake)
    s2 = null
    p1 = anchor(a, s1)
    p2 = { x: b.x, y: b.y }
  } else {
    ;[s1, s2] = autoSides(a, b)
    if (edge.fromSide) s1 = edge.fromSide
    if (edge.toSide) s2 = edge.toSide
    p1 = anchor(a, s1)
    p2 = anchor(b, s2)
  }
  const n1 = NORMAL[s1]
  const n2 = s2 ? NORMAL[s2] : [-n1[0], -n1[1]]
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
  // Unit perpendicular of the chord, for bend.
  const px = -(p2.y - p1.y) / dist
  const py = (p2.x - p1.x) / dist

  if (style === 'straight') {
    const m = { x: (p1.x + p2.x) / 2 + px * bend, y: (p1.y + p2.y) / 2 + py * bend }
    const pts = bend ? [p1, m, p2] : [p1, p2]
    return { d: `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`, points: densify(pts), p1, p2, s1, s2 }
  }

  if (style === 'elbow') {
    const lead = 24
    const a1 = { x: p1.x + n1[0] * lead, y: p1.y + n1[1] * lead }
    const a2 = { x: p2.x + n2[0] * lead, y: p2.y + n2[1] * lead }
    const horiz1 = n1[0] !== 0
    const horiz2 = n2[0] !== 0
    let pts
    if (horiz1 && horiz2) {
      const mx = (a1.x + a2.x) / 2 + bend
      pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]
    } else if (!horiz1 && !horiz2) {
      const my = (a1.y + a2.y) / 2 + bend
      pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2]
    } else if (horiz1) {
      pts = [p1, { x: p2.x, y: p1.y }, p2]
    } else {
      pts = [p1, { x: p1.x, y: p2.y }, p2]
    }
    return { d: roundedPath(pts), points: densify(pts), p1, p2, s1, s2 }
  }

  // curve
  const k = Math.max(36, Math.min(dist * 0.45, 220))
  const c1 = { x: p1.x + n1[0] * k + px * bend * 1.33, y: p1.y + n1[1] * k + py * bend * 1.33 }
  const c2 = { x: p2.x + n2[0] * k + px * bend * 1.33, y: p2.y + n2[1] * k + py * bend * 1.33 }
  const points = []
  for (let i = 0; i <= 32; i++) points.push(bez(p1, c1, c2, p2, i / 32))
  return { d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`, points, p1, p2, s1, s2 }
}

function densify(pts) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < 8; j++) {
      const t = j / 8
      out.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t })
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

// Point at fraction t (by arc length) along a sampled polyline.
export function pointAt(points, t = 0.5) {
  const seg = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    seg.push(l)
    total += l
  }
  let target = total * Math.min(1, Math.max(0, t))
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? target / seg[i] : 0
      return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f }
    }
    target -= seg[i]
  }
  return points[0]
}

// Nearest arc-length fraction on the polyline to point p (label sliding).
export function nearestT(points, p) {
  let best = 0
  let bestD = Infinity
  let acc = 0
  let total = 0
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    cum.push(total)
  }
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - p.x, points[i].y - p.y)
    if (d < bestD) {
      bestD = d
      best = cum[i]
    }
  }
  acc = total ? best / total : 0.5
  return acc
}

export { sideOfPoint }
