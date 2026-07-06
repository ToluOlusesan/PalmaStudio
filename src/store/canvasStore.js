import { create } from 'zustand'
import { uid } from '../utils/id.js'

// Live canvas state for whichever board is open (Dump Board / Focus).
// Deliberately does NOT persist itself — sessionStore serialises it on a
// debounce. Keeping it flat keeps drag/resize updates cheap.
const initial = {
  panX: 0,
  panY: 0,
  zoom: 1,
  items: [],
  selectedIds: [],
  maxZ: 0,
  tool: 'select', // 'select' | 'pan'
  edges: [], // connectors between items: { id, from, to, label? }
  selectedEdgeId: null, // currently-selected connector
  linking: null, // in-progress connector drag: { fromId, x, y } (canvas coords)
  past: [], // undo stack — snapshots of { items, maxZ, edges }
  future: [], // redo stack
  dropTargetGroupId: null, // group highlighted as a drop target during a drag
  draggingItems: false, // true while items are being dragged (hides overlays)
}

const HISTORY_CAP = 60
const snap = (s) => ({ items: s.items, maxZ: s.maxZ, edges: s.edges })

// Frame colours for groups — the second sanctioned place colour appears (after
// comments). Cream is intentionally omitted (too close to the accent).
export const GROUP_COLORS = ['#D85C53', '#D89A4E', '#5FA968', '#5B8BC4', '#9B7BC4', '#C45B8B']

// Pick the least-used frame colour so adjacent groups stay visually distinct.
const pickGroupColor = (items) => {
  const counts = new Map(GROUP_COLORS.map((c) => [c, 0]))
  const seen = new Set()
  for (const it of items) {
    if (it.groupId && it.groupColor && !seen.has(it.groupId)) {
      seen.add(it.groupId)
      counts.set(it.groupColor, (counts.get(it.groupColor) || 0) + 1)
    }
  }
  let best = GROUP_COLORS[0]
  let min = Infinity
  for (const c of GROUP_COLORS) {
    const n = counts.get(c) || 0
    if (n < min) {
      min = n
      best = c
    }
  }
  return best
}

// Bounding box per group (canvas coords), keyed by groupId. Used for the drop
// hit-test. `exclude` skips a group (e.g. the one being dragged).
const groupBoxes = (items, exclude) => {
  const m = new Map()
  for (const it of items) {
    if (!it.groupId || it.groupId === exclude) continue
    const b = m.get(it.groupId)
    if (b) {
      b.minX = Math.min(b.minX, it.x)
      b.minY = Math.min(b.minY, it.y)
      b.maxX = Math.max(b.maxX, it.x + it.width)
      b.maxY = Math.max(b.maxY, it.y + it.height)
    } else {
      m.set(it.groupId, { minX: it.x, minY: it.y, maxX: it.x + it.width, maxY: it.y + it.height })
    }
  }
  return m
}

// Expand a set of ids to include every item that shares a group with any of
// them, so grouped items always select / move / delete as one unit.
const withGroupMates = (items, ids) => {
  const out = new Set(ids)
  const groups = new Set(
    items.filter((it) => out.has(it.id) && it.groupId).map((it) => it.groupId)
  )
  if (groups.size) {
    for (const it of items) if (it.groupId && groups.has(it.groupId)) out.add(it.id)
  }
  return [...out]
}

export const useCanvasStore = create((set, get) => ({
  ...initial,

  // Replace whole state when a session/module loads. Clears history.
  hydrate: (board = {}) =>
    set({
      panX: board.panX ?? 0,
      panY: board.panY ?? 0,
      zoom: board.zoom ?? 1,
      items: board.items ?? [],
      maxZ: board.maxZ ?? (board.items?.length || 0),
      edges: board.edges ?? [],
      selectedIds: [],
      selectedEdgeId: null,
      linking: null,
      past: [],
      future: [],
    }),

  reset: () => set({ ...initial }),

  setPan: (panX, panY) => set({ panX, panY }),
  setZoom: (zoom) => set({ zoom }),
  setTool: (tool) => set({ tool }),

  // ---- Undo / redo -------------------------------------------------------
  // pushHistory() snapshots the CURRENT items before a mutation. Callers invoke
  // it once per discrete action (an add, a delete, the start of a drag/resize,
  // a Tidy). Continuous updates (a drag in flight) call it once, not per frame.
  pushHistory: () =>
    set((s) => ({
      past: [...s.past.slice(-(HISTORY_CAP - 1)), snap(s)],
      future: [],
    })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return {}
      const prev = s.past[s.past.length - 1]
      const live = new Set(prev.items.map((i) => i.id))
      return {
        items: prev.items,
        maxZ: prev.maxZ,
        edges: prev.edges ?? [],
        past: s.past.slice(0, -1),
        future: [...s.future, snap(s)].slice(-HISTORY_CAP),
        selectedIds: s.selectedIds.filter((id) => live.has(id)),
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return {}
      const next = s.future[s.future.length - 1]
      const live = new Set(next.items.map((i) => i.id))
      return {
        items: next.items,
        maxZ: next.maxZ,
        edges: next.edges ?? [],
        future: s.future.slice(0, -1),
        past: [...s.past, snap(s)].slice(-HISTORY_CAP),
        selectedIds: s.selectedIds.filter((id) => live.has(id)),
      }
    }),

  // Batch-apply new positions ([{id,x,y}]) — used by drag, Tidy, Breathe, undo.
  applyPositions: (positions) =>
    set((s) => {
      const byId = new Map(positions.map((p) => [p.id, p]))
      return {
        items: s.items.map((it) => {
          const p = byId.get(it.id)
          return p ? { ...it, x: p.x, y: p.y } : it
        }),
      }
    }),

  // Shift a set of items by a delta (arrow-key nudge). Caller handles history.
  moveBy: (ids, dx, dy) =>
    set((s) => {
      const sel = new Set(ids)
      return {
        items: s.items.map((it) =>
          sel.has(it.id) ? { ...it, x: it.x + dx, y: it.y + dy } : it
        ),
      }
    }),

  addItem: (partial) => {
    get().pushHistory()
    const maxZ = get().maxZ + 1
    const item = {
      id: uid('item'),
      type: 'note',
      x: 0,
      y: 0,
      width: 160,
      height: 120,
      zIndex: maxZ,
      label: '',
      ...partial,
    }
    set((s) => ({ items: [...s.items, item], maxZ, selectedIds: [item.id] }))
    return item.id
  },

  // Add several items in one undo step; selects them. Used by paste / duplicate.
  addItems: (partials = []) => {
    if (!partials.length) return []
    get().pushHistory()
    let maxZ = get().maxZ
    const items = partials.map((p) => ({
      id: uid('item'),
      type: 'note',
      x: 0,
      y: 0,
      width: 160,
      height: 120,
      label: '',
      ...p,
      zIndex: ++maxZ,
    }))
    const ids = items.map((it) => it.id)
    set((s) => ({ items: [...s.items, ...items], maxZ, selectedIds: ids }))
    return ids
  },

  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),

  deleteItem: (id) => {
    get().pushHistory()
    set((s) => ({
      items: s.items.filter((it) => it.id !== id),
      selectedIds: s.selectedIds.filter((x) => x !== id),
      edges: s.edges.filter((e) => e.from !== id && e.to !== id),
    }))
  },

  // Remove several items at once (multi-select delete) — one undo entry. Also
  // prunes any connectors that touched a removed item.
  deleteItems: (ids) => {
    if (!ids || !ids.length) return
    get().pushHistory()
    const kill = new Set(ids)
    set((s) => ({
      items: s.items.filter((it) => !kill.has(it.id)),
      selectedIds: s.selectedIds.filter((x) => !kill.has(x)),
      edges: s.edges.filter((e) => !kill.has(e.from) && !kill.has(e.to)),
    }))
  },

  bringToFront: (id) => {
    const maxZ = get().maxZ + 1
    set((s) => ({
      maxZ,
      items: s.items.map((it) => (it.id === id ? { ...it, zIndex: maxZ } : it)),
    }))
  },

  sendToBack: (id) =>
    set((s) => {
      const minZ = Math.min(0, ...s.items.map((it) => it.zIndex ?? 0))
      return {
        items: s.items.map((it) => (it.id === id ? { ...it, zIndex: minZ - 1 } : it)),
      }
    }),

  select: (id, additive = false) =>
    set((s) => {
      // A click on any grouped item selects (or toggles) the whole group.
      const mates = withGroupMates(s.items, [id])
      if (!additive) return { selectedIds: mates, selectedEdgeId: null }
      const cur = new Set(s.selectedIds)
      const allIn = mates.every((m) => cur.has(m))
      mates.forEach((m) => (allIn ? cur.delete(m) : cur.add(m)))
      return { selectedIds: [...cur], selectedEdgeId: null }
    }),

  // Replace the whole selection (marquee, select-all). Snaps to whole groups.
  setSelection: (ids) =>
    set((s) => ({ selectedIds: withGroupMates(s.items, ids), selectedEdgeId: null })),

  clearSelection: () => set({ selectedIds: [], selectedEdgeId: null }),

  // ---- Connectors --------------------------------------------------------
  // A line between two items. Drag from an item's link handle onto another.
  addEdge: (from, to) => {
    if (!from || !to || from === to) return
    const dup = get().edges.some(
      (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from)
    )
    if (dup) return
    get().pushHistory()
    const id = uid('edge')
    set((s) => ({ edges: [...s.edges, { id, from, to }], selectedEdgeId: id, selectedIds: [] }))
  },

  removeEdge: (id) => {
    if (!id) return
    get().pushHistory()
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
    }))
  },

  setEdgeLabel: (id, label) => {
    get().pushHistory()
    const l = (label || '').trim()
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, label: l || undefined } : e)),
    }))
  },

  selectEdge: (id) => set({ selectedEdgeId: id, selectedIds: [] }),

  setLinking: (v) => set((s) => (s.linking === v ? {} : { linking: v })),

  // ---- Grouping ----------------------------------------------------------
  // Tag a set of items with a shared groupId (+ a frame colour) so they behave
  // as one unit. group() needs ≥2 items; ungroup() clears every group touched.
  group: (ids) => {
    if (!ids || ids.length < 2) return
    get().pushHistory()
    const gid = uid('group')
    const color = pickGroupColor(get().items)
    const sel = new Set(ids)
    set((s) => ({
      items: s.items.map((it) =>
        sel.has(it.id) ? { ...it, groupId: gid, groupColor: color } : it
      ),
    }))
  },

  ungroup: (ids) => {
    const cur = get().items
    const sel = new Set(ids || [])
    const groups = new Set(cur.filter((it) => sel.has(it.id) && it.groupId).map((it) => it.groupId))
    if (!groups.size) return
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) =>
        it.groupId && groups.has(it.groupId)
          ? { ...it, groupId: undefined, groupColor: undefined }
          : it
      ),
    }))
  },

  // Pull a single item out of its group, leaving the rest grouped. If that would
  // leave the group with fewer than 2 members, dissolve the group entirely.
  removeFromGroup: (id) => {
    const items = get().items
    const item = items.find((it) => it.id === id)
    if (!item || !item.groupId) return
    const gid = item.groupId
    const remaining = items.filter((it) => it.groupId === gid && it.id !== id)
    const dissolve = remaining.length < 2
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => {
        if (it.id === id || (dissolve && it.groupId === gid)) {
          return { ...it, groupId: undefined, groupColor: undefined, groupName: undefined }
        }
        return it
      }),
    }))
  },

  // Add items to an existing group, inheriting its frame colour + name. No
  // history of its own — it rides on the drag's single undo entry (caller pushed).
  addToGroup: (ids, groupId) => {
    if (!ids?.length || !groupId) return
    const member = get().items.find((it) => it.groupId === groupId)
    if (!member) return
    const { groupColor, groupName } = member
    const sel = new Set(ids)
    set((s) => ({
      items: s.items.map((it) =>
        sel.has(it.id) ? { ...it, groupId, groupColor, groupName } : it
      ),
    }))
  },

  // Rename a group — sets (or clears) groupName on every member.
  renameGroup: (groupId, name) => {
    if (!groupId) return
    const trimmed = (name || '').trim()
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) =>
        it.groupId === groupId ? { ...it, groupName: trimmed || undefined } : it
      ),
    }))
  },

  // ---- Align / distribute / lock ----------------------------------------
  // Align selected (unlocked) items to a shared edge or centre of their bbox.
  // mode: left | hcenter | right | top | vmiddle | bottom.
  alignSelected: (mode) => {
    const ids = new Set(get().selectedIds)
    const sel = get().items.filter((it) => ids.has(it.id) && !it.locked)
    if (sel.length < 2) return
    const minX = Math.min(...sel.map((i) => i.x))
    const maxX = Math.max(...sel.map((i) => i.x + i.width))
    const minY = Math.min(...sel.map((i) => i.y))
    const maxY = Math.max(...sel.map((i) => i.y + i.height))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const alignX = mode === 'left' || mode === 'right' || mode === 'hcenter'

    // 1) Move each item onto the shared edge / centre line.
    const placed = sel.map((it) => {
      let { x, y } = it
      if (mode === 'left') x = minX
      else if (mode === 'right') x = maxX - it.width
      else if (mode === 'hcenter') x = cx - it.width / 2
      else if (mode === 'top') y = minY
      else if (mode === 'bottom') y = maxY - it.height
      else if (mode === 'vmiddle') y = cy - it.height / 2
      return { id: it.id, x, y, width: it.width, height: it.height }
    })

    // 2) Collapsing onto a line stacks anything that shared the other axis. Sweep
    // the free axis in order and push overlaps apart with a small gutter so
    // aligned items form a tidy row/column instead of piling up. Items that were
    // already spread out keep their spacing (only true overlaps get nudged).
    const GUT = 12
    if (alignX) {
      placed.sort((a, b) => a.y - b.y)
      let end = -Infinity
      for (const p of placed) {
        if (p.y < end) p.y = end
        end = p.y + p.height + GUT
      }
    } else {
      placed.sort((a, b) => a.x - b.x)
      let end = -Infinity
      for (const p of placed) {
        if (p.x < end) p.x = end
        end = p.x + p.width + GUT
      }
    }

    get().pushHistory()
    const at = new Map(placed.map((p) => [p.id, { x: Math.round(p.x), y: Math.round(p.y) }]))
    set((s) => ({ items: s.items.map((it) => (at.has(it.id) ? { ...it, ...at.get(it.id) } : it)) }))
  },

  // Even spacing between selected (unlocked) items along an axis ('h' | 'v').
  distributeSelected: (axis) => {
    const ids = new Set(get().selectedIds)
    const sel = get().items.filter((it) => ids.has(it.id) && !it.locked)
    if (sel.length < 3) return
    const horiz = axis === 'h'
    const sorted = [...sel].sort((a, b) => (horiz ? a.x - b.x : a.y - b.y))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = horiz
      ? last.x + last.width - first.x
      : last.y + last.height - first.y
    const total = sorted.reduce((s, i) => s + (horiz ? i.width : i.height), 0)
    // Even gap between items. When the items are larger than the span between the
    // first and last (they were bunched up), this would go negative and pile them
    // on top of each other — so fall back to a fixed gutter that keeps them apart.
    const rawGap = (span - total) / (sorted.length - 1)
    const gap = rawGap >= 0 ? rawGap : 12
    get().pushHistory()
    let cursor = horiz ? first.x : first.y
    const at = new Map()
    for (const it of sorted) {
      at.set(it.id, Math.round(cursor))
      cursor += (horiz ? it.width : it.height) + gap
    }
    set((s) => ({
      items: s.items.map((it) =>
        at.has(it.id) ? { ...it, [horiz ? 'x' : 'y']: at.get(it.id) } : it
      ),
    }))
  },

  // Lock / unlock the given items as one undo step. If any are unlocked, lock
  // all; otherwise unlock all. Locked items can't be dragged or resized.
  toggleLock: (ids) => {
    const sel = new Set(ids || [])
    const cur = get().items.filter((it) => sel.has(it.id))
    if (!cur.length) return
    const lock = cur.some((it) => !it.locked)
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => (sel.has(it.id) ? { ...it, locked: lock } : it)),
    }))
  },

  // Drop hit-test: the id of the group whose padded box contains (x,y),
  // excluding `exclude` (the dragged item's own group). null if none.
  groupAt: (x, y, exclude) => {
    const PAD = 8
    for (const [gid, b] of groupBoxes(get().items, exclude)) {
      if (x >= b.minX - PAD && x <= b.maxX + PAD && y >= b.minY - PAD && y <= b.maxY + PAD) {
        return gid
      }
    }
    return null
  },

  setDropTarget: (groupId) =>
    set((s) => (s.dropTargetGroupId === groupId ? {} : { dropTargetGroupId: groupId })),

  setDraggingItems: (v) =>
    set((s) => (s.draggingItems === v ? {} : { draggingItems: v })),

  // Serialisable snapshot for the session file.
  snapshot: () => {
    const { panX, panY, zoom, items, maxZ, edges } = get()
    // Object URLs (blob:) are session-scoped — they die when the app closes, so
    // we never write them to disk. The item keeps its path, label, geometry and
    // poster, and reloads as a missing-file placeholder rather than a dead link.
    // Stable refs (data:, asset:) are persisted untouched.
    const persisted = items.map((it) =>
      typeof it.src === 'string' && it.src.startsWith('blob:')
        ? { ...it, src: undefined, missing: true }
        : it
    )
    return { panX, panY, zoom, items: persisted, maxZ, edges }
  },
}))
