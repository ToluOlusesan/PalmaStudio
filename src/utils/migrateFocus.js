import { uid } from './id.js'
import { GROUP_COLORS } from '../store/canvasStore.js'

// One-time move of a legacy Focus board onto the Dump Board (1.4.0 merged the
// two). Each zone with content becomes a named, coloured group of copies of its
// references (+ its pinned notes), laid out in a row to the right of whatever is
// already on the board. The focus slice itself is left intact (only flagged
// `migrated`) so nothing is lost if this ever needs revisiting.
const LONG = 240
const GAP = 16

export function migrateFocus(board, focus) {
  if (!focus || focus.migrated) return null
  const zones = focus.zones || []
  const queue = new Map((focus.queue || []).map((q) => [q.id, q]))
  const items = board.items || []
  const byId = new Map(items.map((it) => [it.id, it]))
  let cursorX = items.length ? Math.max(...items.map((it) => it.x + it.width)) + 160 : 80
  const top = items.length ? Math.min(...items.map((it) => it.y)) : 80
  let z = board.maxZ || items.length
  const out = []

  zones.forEach((zone, zi) => {
    const members = (focus.placed || [])
      .filter((p) => p.zoneId === zone.id)
      .map((p) => queue.get(p.queueItemId))
      .filter(Boolean)
    const notes = (focus.notes || []).filter((n) => n.zoneId === zone.id)
    if (!members.length && !notes.length) return
    const groupId = uid('group')
    const groupColor = GROUP_COLORS[zi % GROUP_COLORS.length]
    const cols = Math.max(1, Math.ceil(Math.sqrt(members.length + notes.length)))
    let col = 0
    let x = cursorX
    let y = top
    let rowH = 0
    let maxX = cursorX
    const place = (w, h) => {
      if (col === cols) { col = 0; x = cursorX; y += rowH + GAP; rowH = 0 }
      const pos = { x, y }
      x += w + GAP
      rowH = Math.max(rowH, h)
      maxX = Math.max(maxX, x)
      col++
      return pos
    }
    for (const q of members) {
      const src = byId.get(q.sourceItemId)
      const ar = (q.width || 1) / (q.height || 1)
      const w = ar >= 1 ? LONG : Math.round(LONG * ar)
      const h = ar >= 1 ? Math.round(LONG / ar) : LONG
      const base = src ? { ...src } : { type: q.type, src: q.src, label: q.label, content: q.content }
      delete base.crop
      out.push({ ...base, id: uid('item'), ...place(w, h), width: w, height: h, zIndex: ++z, groupId, groupColor, groupName: zone.name || '' })
    }
    for (const n of notes) {
      const w = n.width || 200
      const h = n.height || 140
      out.push({ id: uid('item'), type: 'note', content: n.content || n.text || '', color: n.color, ...place(w, h), width: w, height: h, zIndex: ++z, groupId, groupColor, groupName: zone.name || '' })
    }
    cursorX = maxX + 160
  })
  if (!out.length) return { items, maxZ: board.maxZ }
  return { items: [...items, ...out], maxZ: z }
}
