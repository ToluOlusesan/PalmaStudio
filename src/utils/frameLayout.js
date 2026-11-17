// Arrange a frame's members. Layouts keep the frame's top-left fixed and use one
// even gutter so a frame reads as a composed section, not a pile.
//   grid    — columns of the widest member, rows of the tallest per row
//   masonry — equal-width columns, shortest-column-first; media rescaled to the
//             column width (aspect kept), notes keep their height
//   row     — one line at a shared height (media rescaled, aspect kept)
export const FRAME_GAP = 16
export const FRAME_LAYOUTS = ['free', 'grid', 'masonry', 'row']

const isMedia = (it) => it.type === 'image' || it.type === 'gif' || it.type === 'video'
const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)] || 0
}
// Reading order so re-arranging doesn't shuffle what the user already placed.
const readingOrder = (arr) => [...arr].sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x))
// Cropped media can't be rescaled independently of its crop box; leave its size.
const scalable = (it) => isMedia(it) && !it.crop && !it.locked

export function arrangeFrame(members, mode) {
  if (!members.length || mode === 'free') return []
  const list = readingOrder(members.filter((m) => !m.locked))
  const x0 = Math.min(...members.map((m) => m.x))
  const y0 = Math.min(...members.map((m) => m.y))
  const cols = Math.max(1, Math.round(Math.sqrt(list.length * 1.3)))
  const out = []

  if (mode === 'row') {
    const h = Math.round(median(list.filter(isMedia).map((m) => m.height)) || median(list.map((m) => m.height)))
    let x = x0
    for (const m of list) {
      const k = scalable(m) ? h / m.height : 1
      const w = Math.round(m.width * k)
      out.push({ id: m.id, x, y: y0, width: w, height: Math.round(m.height * k) })
      x += w + FRAME_GAP
    }
    return out
  }

  if (mode === 'masonry') {
    const colW = Math.round(median(list.map((m) => m.width)))
    const heights = Array(cols).fill(y0)
    for (const m of list) {
      const c = heights.indexOf(Math.min(...heights))
      const k = scalable(m) ? colW / m.width : 1
      const w = scalable(m) ? colW : Math.min(m.width, colW)
      const h = Math.round(m.height * k)
      out.push({ id: m.id, x: x0 + c * (colW + FRAME_GAP), y: heights[c], width: w, height: h })
      heights[c] += h + FRAME_GAP
    }
    return out
  }

  // grid
  const colW = Array(cols).fill(0)
  list.forEach((m, i) => { colW[i % cols] = Math.max(colW[i % cols], m.width) })
  let y = y0
  for (let r = 0; r * cols < list.length; r++) {
    const row = list.slice(r * cols, r * cols + cols)
    let x = x0
    row.forEach((m, c) => {
      out.push({ id: m.id, x, y })
      x += colW[c] + FRAME_GAP
    })
    y += Math.max(...row.map((m) => m.height)) + FRAME_GAP
  }
  return out
}
