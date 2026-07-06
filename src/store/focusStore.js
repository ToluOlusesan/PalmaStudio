import { create } from 'zustand'
import { uid } from '../utils/id.js'
import { useSessionStore } from './sessionStore.js'

// Focus board state — zones (tinted frame areas), a queue of references promoted
// from the Dump Board, and the items placed into zones, plus the project's
// Direction statement and the board's own pan/zoom. Persisted into the session's
// `focus` module slice (→ palma.json) via sessionStore.saveModule. Lives apart
// from canvasStore because Send-to-Focus runs while the Dump Board is the active
// board, so the queue must be reachable without Focus being mounted.

// The only non-ink colour on the Focus canvas: soft coloured-acetate tints. Each
// zone stores its colour name; fill/border opacities are derived at render time.
export const ZONE_COLORS = [
  { name: 'amber', h: 38, s: 70, l: 60 },
  { name: 'sage', h: 150, s: 30, l: 50 },
  { name: 'rose', h: 345, s: 40, l: 65 },
  { name: 'slate', h: 220, s: 30, l: 55 },
  { name: 'terracotta', h: 18, s: 55, l: 55 },
  { name: 'lavender', h: 270, s: 35, l: 65 },
  { name: 'moss', h: 90, s: 25, l: 45 },
  { name: 'stone', h: 40, s: 15, l: 60 },
]

const colorByName = (name) => ZONE_COLORS.find((c) => c.name === name) || ZONE_COLORS[0]
// `vibrant` pushes saturation + lightness up for a richer, glowing tint (reserved
// for a lit-zones treatment); the default sits flat on paper.
export const zoneFill = (name, a = 0.1, vibrant = false) => {
  const c = colorByName(name)
  const s = vibrant ? Math.min(100, c.s + 28) : c.s
  const l = vibrant ? Math.min(72, c.l + 6) : c.l
  return `hsla(${c.h}, ${s}%, ${l}%, ${a})`
}
export const zoneStroke = (name, a = 0.3, vibrant = false) => {
  const c = colorByName(name)
  const s = vibrant ? Math.min(100, c.s + 32) : c.s
  const l = vibrant ? Math.min(70, c.l + 4) : c.l
  return `hsla(${c.h}, ${s}%, ${l}%, ${a})`
}

// Three suggested starting zones, laid out in a loose grid in world space. Each
// zone owns a member layout mode ('grid' | 'horizontal' | 'vertical').
const defaultZones = () => [
  { id: uid('zone'), name: 'Colour + Mood', color: 'amber', x: 80, y: 80, width: 360, height: 300, layout: 'grid' },
  { id: uid('zone'), name: 'Texture + Material', color: 'sage', x: 480, y: 80, width: 360, height: 300, layout: 'grid' },
  { id: uid('zone'), name: 'Motion + Feel', color: 'slate', x: 280, y: 420, width: 360, height: 300, layout: 'grid' },
]

const blank = {
  panX: 0,
  panY: 0,
  zoom: 1,
  queue: [],
  zones: [],
  placed: [],
  direction: '',
  // Board-level annotations, separate from zone members (the queue-placed
  // references). Two kinds share this array:
  //   note    — freestanding, world-space x/y/width/height, like a Dump Board note.
  //   comment — pinned to a zone (zoneId set); x/y are an OFFSET from that zone's
  //             top-left, so the pin auto-follows the zone when it moves/resizes
  //             without any extra bookkeeping.
  notes: [],
}

let stampTimer = null

export const useFocusStore = create((set, get) => ({
  ...blank,
  loadedId: null,
  stampingId: null, // transient: id of the Dump Board item playing the stamp

  // Hydrate from the open session's `focus` slice. Seeds the three default zones
  // the first time a project's Focus is opened (slice absent), but never again —
  // so a user who deletes zones doesn't get them back.
  loadFromSession: (session) => {
    if (!session) return
    if (get().loadedId === session.id) return
    const slice = session.modules?.focus
    if (slice) {
      set({
        panX: slice.panX ?? 0,
        panY: slice.panY ?? 0,
        zoom: slice.zoom ?? 1,
        queue: slice.queue ?? [],
        zones: slice.zones ?? [],
        placed: slice.placed ?? [],
        direction: slice.direction ?? '',
        notes: slice.notes ?? [],
        loadedId: session.id,
        stampingId: null,
      })
    } else {
      set({ ...blank, zones: defaultZones(), loadedId: session.id, stampingId: null })
    }
  },

  // Write the durable slice back to the session (debounced flush to disk inside).
  persist: () => {
    const { panX, panY, zoom, queue, zones, placed, direction, notes } = get()
    useSessionStore.getState().saveModule('focus', { panX, panY, zoom, queue, zones, placed, direction, notes })
  },

  setView: (panX, panY, zoom) => set({ panX, panY, zoom }),
  commitView: () => get().persist(),

  // ---- Queue (Send to Focus) --------------------------------------------
  // Promote a Dump Board item. One queue entry per source item — re-sending an
  // already-queued item is a no-op that still replays the stamp. References the
  // source only (id, src, dims), never binary data.
  sendToFocus: (item) => {
    if (!item) return
    set((s) => {
      const exists = s.queue.some((q) => q.sourceItemId === item.id)
      if (exists) return {}
      const entry = {
        id: uid('q'),
        sourceItemId: item.id,
        type: item.type,
        src: item.src ?? null,
        label: item.label ?? '',
        content: item.type === 'note' || item.type === 'comment' ? item.content ?? '' : undefined,
        width: item.width,
        height: item.height,
      }
      return { queue: [...s.queue, entry] }
    })
    // Replay the stamp regardless (even on a re-send).
    set({ stampingId: item.id })
    if (stampTimer) clearTimeout(stampTimer)
    stampTimer = setTimeout(() => set({ stampingId: null }), 220)
    get().persist()
  },
  removeFromQueue: (queueId) => {
    set((s) => ({
      queue: s.queue.filter((q) => q.id !== queueId),
      placed: s.placed.filter((p) => p.queueItemId !== queueId),
    }))
    get().persist()
  },

  // ---- Zones ------------------------------------------------------------
  addZone: () => {
    set((s) => {
      const used = new Set(s.zones.map((z) => z.color))
      const color = (ZONE_COLORS.find((c) => !used.has(c.name)) || ZONE_COLORS[s.zones.length % ZONE_COLORS.length]).name
      const n = s.zones.length + 1
      // Step new zones down-right so they don't land exactly on an existing one.
      const off = (s.zones.length % 4) * 28
      return {
        zones: [...s.zones, { id: uid('zone'), name: `Zone ${n}`, color, x: 120 + off, y: 120 + off, width: 360, height: 300, layout: 'grid' }],
      }
    })
    get().persist()
  },
  updateZone: (id, patch) => {
    set((s) => ({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }))
  },
  commitZones: () => get().persist(),
  deleteZone: (id) => {
    // Items placed in this zone return to the queue's unplaced state.
    set((s) => ({
      zones: s.zones.filter((z) => z.id !== id),
      placed: s.placed.filter((p) => p.zoneId !== id),
    }))
    get().persist()
  },

  // ---- Placed items (zone members) --------------------------------------
  // A placed item is just a membership: { id, queueItemId, zoneId }. Its size and
  // position are derived from the zone's grid layout (zones are containers), so
  // there's no free x/y/width/height — dropping an item fits it into the zone.
  placeItem: (queueItemId, zoneId) => {
    if (!zoneId) return // only land inside a zone
    set((s) => ({ placed: [...s.placed, { id: uid('placed'), queueItemId, zoneId }] }))
    get().persist()
  },
  // Move a member to a zone at a target index (reorders the flat array so the
  // target zone's member order reflects the insertion point). Used for both
  // reordering within a zone and moving between zones by dragging.
  moveMember: (placedId, zoneId, index) => {
    set((s) => {
      const item = s.placed.find((p) => p.id === placedId)
      if (!item || !zoneId) return {}
      const without = s.placed.filter((p) => p.id !== placedId)
      const updated = { ...item, zoneId }
      const members = without.filter((p) => p.zoneId === zoneId)
      const i = Math.max(0, Math.min(index, members.length))
      let insertAt
      if (i >= members.length) {
        const last = members[members.length - 1]
        insertAt = last ? without.indexOf(last) + 1 : without.length
      } else {
        insertAt = without.indexOf(members[i])
      }
      return { placed: [...without.slice(0, insertAt), updated, ...without.slice(insertAt)] }
    })
    get().persist()
  },
  unplaceItem: (placedId) => {
    set((s) => ({ placed: s.placed.filter((p) => p.id !== placedId) }))
    get().persist()
  },

  // ---- Direction --------------------------------------------------------
  // State-only while typing; the DirectionBar calls persist() on blur.
  setDirection: (text) => set({ direction: text }),

  // ---- Notes & comments ---------------------------------------------------
  // Freestanding note at world coords `at` (canvas centre by default).
  addNote: (at) => {
    const id = uid('fnote')
    set((s) => ({
      notes: [
        ...s.notes,
        { id, type: 'note', content: '', x: Math.round(at.x - 90), y: Math.round(at.y - 65), width: 180, height: 130 },
      ],
    }))
    get().persist()
    return id
  },
  // Comment pinned to a zone — x/y are an offset from the zone's top-left, so it
  // rides along automatically as the zone moves/resizes. Starts expanded+empty
  // (so you can type at once), staggered off any comments already on this zone.
  addZoneComment: (zoneId) => {
    const id = uid('fcomment')
    set((s) => {
      const existing = s.notes.filter((n) => n.type === 'comment' && n.zoneId === zoneId).length
      const zone = s.zones.find((z) => z.id === zoneId)
      const off = existing * 22
      return {
        notes: [
          ...s.notes,
          {
            id,
            type: 'comment',
            zoneId,
            content: '',
            collapsed: false,
            x: Math.max(8, (zone?.width || 360) - 208 - off),
            y: -12 + off,
            width: 176,
            height: 88,
          },
        ],
      }
    })
    get().persist()
    return id
  },
  updateNote: (id, patch) => set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
  commitNotes: () => get().persist(),
  deleteNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
    get().persist()
  },
}))
