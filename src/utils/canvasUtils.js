// Canvas layout maths for the Dump Board: grid snapping, the Tidy packed-row
// arrangement, and the Breathe radial spread. All produce grid-snapped output
// and work in canvas-space (world units), so callers convert container pixels
// by the current zoom before passing them in.

export const snapToGrid = (value, gridSize = 24) => Math.round(value / gridSize) * gridSize

// Read an image's intrinsic pixel dimensions from any src (data:, asset:, blob:,
// http:). Resolves null if it can't load, so callers fall back to a default box.
export function loadImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Pick a canvas box that respects an image's real aspect ratio instead of
// forcing a fixed rectangle (which letterboxes / distorts most pictures).
// Targets ~`target` on the long edge, clamped so nothing lands tiny or huge.
export function fitImageBox(w, h, { target = 240, min = 96, max = 360 } = {}) {
  if (!w || !h) return { width: 200, height: 200 }
  const ratio = h / w
  let width = ratio <= 1 ? target : Math.round(target / ratio)
  let height = Math.round(width * ratio)
  const long = Math.max(width, height)
  if (long > max) {
    const k = max / long
    width = Math.round(width * k)
    height = Math.round(height * k)
  }
  const short = Math.min(width, height)
  if (short < min) {
    const k = min / short
    width = Math.round(width * k)
    height = Math.round(height * k)
  }
  return { width, height }
}

// Grab a small still from a (just-dropped) video so a clip that can't be
// relinked after a restart still shows what it was. Returns a tiny JPEG data
// URL — which persists in the session JSON — or null if it can't be read.
export function captureVideoPoster(src) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.crossOrigin = 'anonymous'
    v.preload = 'metadata'
    let settled = false
    const finish = (val) => {
      if (settled) return
      settled = true
      v.removeAttribute('src')
      try {
        v.load()
      } catch {
        /* ignore */
      }
      resolve(val)
    }
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2)
      } catch {
        finish(null)
      }
    }
    v.onseeked = () => {
      try {
        if (!v.videoWidth) return finish(null)
        const c = document.createElement('canvas')
        const r = Math.min(320 / v.videoWidth, 1)
        c.width = Math.round(v.videoWidth * r)
        c.height = Math.round(v.videoHeight * r)
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
        finish(c.toDataURL('image/jpeg', 0.7))
      } catch {
        finish(null)
      }
    }
    v.onerror = () => finish(null)
    setTimeout(() => finish(null), 4000)
    v.src = src
  })
}

const avg = (ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0)

// Tidy: pack items into left-aligned rows that wrap at the visible width.
// Item dimensions are never changed; only x/y move. Returns [{id,x,y}].
export function tidyLayout(items, containerWidth, zoom = 1) {
  if (items.length === 0) return []
  const startX = 32
  const startY = 32
  const gutter = 16
  // visible canvas-space width, minus 64px padding
  const maxRowWidth = Math.max(120, containerWidth / zoom - 64)
  const rightLimit = startX + maxRowWidth

  let x = startX
  let y = startY
  let rowHeight = 0
  const out = []
  for (const it of items) {
    if (x > startX && x + it.width > rightLimit) {
      // wrap to a new row beneath the tallest item of the row just filled
      x = startX
      y += rowHeight + gutter
      rowHeight = 0
    }
    out.push({ id: it.id, x: snapToGrid(x), y: snapToGrid(y) })
    x += it.width + gutter
    rowHeight = Math.max(rowHeight, it.height)
  }
  return out
}

// Cluster-aware Tidy. Items joined by a connector — or sharing a group — are
// treated as one rigid block: the block keeps its internal arrangement and only
// the block as a whole is packed into a row. This is what stops linked diagrams
// and groups from being torn apart (or left stranded while loose items repack),
// which is the "strange" behaviour plain row-packing produced. Comments are not
// tiled here (the board layer rides pinned ones along with their anchor).
// Returns [{id,x,y}] for every non-comment item.
export function tidyClusters(items, edges = [], containerWidth, zoom = 1) {
  const tileable = items.filter((it) => it.type !== 'comment')
  if (tileable.length === 0) return []

  // Union-find over tileable items: union group-mates and connector endpoints.
  const parent = new Map(tileable.map((it) => [it.id, it.id]))
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra && rb && ra !== rb) parent.set(ra, rb)
  }
  const ids = new Set(tileable.map((it) => it.id))
  const groupRep = new Map()
  for (const it of tileable) {
    if (!it.groupId) continue
    if (groupRep.has(it.groupId)) union(groupRep.get(it.groupId), it.id)
    else groupRep.set(it.groupId, it.id)
  }
  for (const e of edges) if (ids.has(e.from) && ids.has(e.to)) union(e.from, e.to)

  // Collapse items into blocks (bounding boxes) keyed by their cluster root.
  const blocks = new Map()
  for (const it of tileable) {
    const r = find(it.id)
    const b =
      blocks.get(r) ||
      { items: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    b.items.push(it)
    b.minX = Math.min(b.minX, it.x)
    b.minY = Math.min(b.minY, it.y)
    b.maxX = Math.max(b.maxX, it.x + it.width)
    b.maxY = Math.max(b.maxY, it.y + it.height)
    blocks.set(r, b)
  }
  const blockList = [...blocks.values()].map((b) => ({
    ...b,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  }))
  // Pack in current reading order (top-to-bottom, then left-to-right) so Tidy
  // feels predictable rather than reshuffling everything.
  blockList.sort((a, b) => a.minY - b.minY || a.minX - b.minX)

  const startX = 32
  const startY = 32
  const gutter = 16
  const maxRowWidth = Math.max(120, containerWidth / zoom - 64)
  const rightLimit = startX + maxRowWidth

  let x = startX
  let y = startY
  let rowHeight = 0
  const out = []
  for (const blk of blockList) {
    if (x > startX && x + blk.width > rightLimit) {
      x = startX
      y += rowHeight + gutter
      rowHeight = 0
    }
    // Move every item in the block by the block's top-left delta — this keeps
    // each cluster's internal layout (and its connectors) intact.
    const dx = snapToGrid(x) - blk.minX
    const dy = snapToGrid(y) - blk.minY
    for (const it of blk.items) out.push({ id: it.id, x: it.x + dx, y: it.y + dy })
    x += blk.width + gutter
    rowHeight = Math.max(rowHeight, blk.height)
  }
  return out
}

// Breathe: push items outward from the collective centroid by a spread factor,
// then resolve overlaps over a few passes. <2 items is a no-op. Returns [{id,x,y}].
export function breatheLayout(items, { spread = 1.6, gutter = 16, passes = 3 } = {}) {
  if (items.length < 2) return items.map((it) => ({ id: it.id, x: it.x, y: it.y }))

  const centroidX = avg(items.map((it) => it.x + it.width / 2))
  const centroidY = avg(items.map((it) => it.y + it.height / 2))

  // spread each item's centre away from the centroid
  const boxes = items.map((it) => {
    const cx = it.x + it.width / 2
    const cy = it.y + it.height / 2
    const ncx = centroidX + (cx - centroidX) * spread
    const ncy = centroidY + (cy - centroidY) * spread
    return { id: it.id, width: it.width, height: it.height, x: ncx - it.width / 2, y: ncy - it.height / 2 }
  })

  // separate overlapping pairs along their least-penetration axis
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (overlapX <= 0 || overlapY <= 0) continue
        if (overlapX < overlapY) {
          const push = (overlapX + gutter) / 2
          const dir = a.x + a.width / 2 <= b.x + b.width / 2 ? 1 : -1
          a.x -= dir * push
          b.x += dir * push
        } else {
          const push = (overlapY + gutter) / 2
          const dir = a.y + a.height / 2 <= b.y + b.height / 2 ? 1 : -1
          a.y -= dir * push
          b.y += dir * push
        }
      }
    }
  }

  return boxes.map((b) => ({ id: b.id, x: snapToGrid(b.x), y: snapToGrid(b.y) }))
}
