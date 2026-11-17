import { GROUP_COLORS } from '../store/canvasStore.js'

// Board groups ("frames") expressed in the legacy Focus shape — zones / placed /
// queue / notes — so the styled Focus PDF + Process Brief exporters keep working
// unchanged now that Focus lives on the board itself.
const HUE_NAMES = ['rose', 'amber', 'sage', 'slate', 'lavender', 'rose']
const PAD = 24

export function framesAsZones(items = []) {
  const groups = new Map()
  for (const it of items) {
    if (!it.groupId || it.placeholder) continue
    if (!groups.has(it.groupId)) groups.set(it.groupId, [])
    groups.get(it.groupId).push(it)
  }
  const zones = []
  const placed = []
  const queue = []
  const notes = []
  for (const [id, members] of groups) {
    const first = members[0]
    const minX = Math.min(...members.map((m) => m.x))
    const minY = Math.min(...members.map((m) => m.y))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    const maxY = Math.max(...members.map((m) => m.y + m.height))
    const ci = Math.max(0, GROUP_COLORS.indexOf(first.groupColor))
    zones.push({ id, name: first.groupName || 'Frame', color: HUE_NAMES[ci] || 'stone', x: minX - PAD, y: minY - PAD, width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2, layout: 'grid' })
    // Reading order: rows top→bottom, then left→right.
    const ordered = [...members].sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x))
    for (const m of ordered) {
      if (m.type === 'image' || m.type === 'gif') {
        queue.push({ id: m.id, sourceItemId: m.id, type: 'image', src: m.src, label: m.label, width: m.width, height: m.height })
        placed.push({ id: `p_${m.id}`, queueItemId: m.id, zoneId: id })
      } else if ((m.type === 'note' || m.type === 'comment') && m.content?.trim()) {
        notes.push({ id: m.id, zoneId: id, kind: m.type, content: m.content, color: m.color })
      }
    }
  }
  return { zones, placed, queue, notes }
}
