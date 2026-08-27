import { create } from 'zustand'
import { uid } from '../utils/id.js'
import { useSessionStore, registerFlushHook } from './sessionStore.js'

// Storyboard state — an ORDERED list of panels, plus the board-wide frame shape.
// Persisted into the session's `storyboard` slice (→ palma.json) via
// sessionStore.saveModule, the same way Focus persists its zones.
//
// The whole model rests on one decision: `panels` array order IS the sequence.
// A panel's number is just its index + 1, so reordering is a splice and there's
// no second structure to keep in sync (and no way for the numbering to drift out
// of step with what you're looking at). `sceneId` is carried on every panel but
// unused until scene bands land — the shape is here so adding them later doesn't
// migrate anyone's saved boards.

// Frame shapes a board can be cut to. Ratio is width ÷ height.
export const ASPECTS = [
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '2.39:1', label: '2.39:1', ratio: 2.39 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
]

// Panel width in CSS px per size step; height falls out of the board's aspect.
export const PANEL_WIDTHS = { sm: 180, md: 260, lg: 360 }

export const aspectRatio = (key) => (ASPECTS.find((a) => a.key === key) || ASPECTS[0]).ratio

// The pixel box every panel on this board is drawn at.
export const panelBox = (aspect, size) => {
  const w = PANEL_WIDTHS[size] || PANEL_WIDTHS.md
  return { w, h: Math.round(w / aspectRatio(aspect)) }
}

export const DEFAULT_DURATION = 2 // seconds

// Runtime as m:ss — the readout a board is judged by.
export const formatRuntime = (seconds = 0) => {
  const total = Math.max(0, Math.round(seconds * 10) / 10)
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return `${m}:${(s < 10 ? '0' : '') + (Number.isInteger(s) ? s : s.toFixed(1))}`
}

const blank = {
  aspect: '16:9',
  panelSize: 'md',
  panels: [],
  scenes: [],
}

const newPanel = (partial = {}) => ({
  id: uid('panel'),
  src: null,
  path: null,
  label: '',
  sourceItemId: null,
  // Framing of the picture inside the fixed panel box: { scale, fx, fy },
  // dimensionless so it survives a change of panel size or board aspect (see
  // utils/cropGeometry). null = centre-cover, what an untouched panel shows.
  crop: null,
  action: '',
  camera: '',
  duration: DEFAULT_DURATION,
  sceneId: null,
  ...partial,
})

// Panel edits arrive in floods — a crop drag fires per frame, typing per key —
// so writing the slice back on every one would spread the whole session object
// each time. State updates immediately; the durable write trails 400ms behind,
// and commit() forces it at the end of a gesture.
let persistTimer = null

export const useStoryboardStore = create((set, get) => ({
  ...blank,
  loadedId: null,

  // Hydrate from the open session's `storyboard` slice. A project that has never
  // had a storyboard just starts empty — no seeded panels, since an empty strip
  // reads as "nothing sent yet" rather than as a mistake to clean up.
  loadFromSession: (session) => {
    if (!session) return
    if (get().loadedId === session.id) return
    const slice = session.modules?.storyboard
    set({
      aspect: slice?.aspect ?? blank.aspect,
      panelSize: slice?.panelSize ?? blank.panelSize,
      panels: slice?.panels ?? [],
      scenes: slice?.scenes ?? [],
      loadedId: session.id,
    })
  },

  persist: () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    const { aspect, panelSize, panels, scenes } = get()
    useSessionStore.getState().saveModule('storyboard', { aspect, panelSize, panels, scenes })
  },
  schedulePersist: () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => get().persist(), 400)
  },
  // Called by sessionStore.flush (including the one on window close) so an edit
  // still inside the 400ms debounce is written rather than lost.
  flushPending: () => {
    if (persistTimer) get().persist()
  },

  setAspect: (aspect) => {
    set({ aspect })
    get().persist()
  },
  setPanelSize: (panelSize) => {
    set({ panelSize })
    get().persist()
  },

  // ---- intake ------------------------------------------------------------
  // Promote a Dump Board item straight to the end of the sequence. Unlike Focus
  // there's no queue to place from: a storyboard IS an order, so an incoming
  // shot has an obvious home (next) and dragging it into position afterwards is
  // one move instead of two.
  sendToStoryboard: (item) => {
    if (!item || (item.type !== 'image' && item.type !== 'video')) return null
    const panel = newPanel({
      src: item.src ?? null,
      path: item.path ?? null,
      label: item.label ?? '',
      sourceItemId: item.id ?? null,
    })
    set((s) => ({ panels: [...s.panels, panel] }))
    get().persist()
    return panel.id
  },

  // A panel with no picture — how you block out a sequence before you have the
  // references for it.
  addEmptyPanel: (atIndex) => {
    const panel = newPanel()
    set((s) => {
      const next = [...s.panels]
      next.splice(atIndex ?? next.length, 0, panel)
      return { panels: next }
    })
    get().persist()
    return panel.id
  },

  duplicatePanel: (id) => {
    set((s) => {
      const i = s.panels.findIndex((p) => p.id === id)
      if (i === -1) return {}
      const next = [...s.panels]
      next.splice(i + 1, 0, { ...s.panels[i], id: uid('panel') })
      return { panels: next }
    })
    get().persist()
  },

  updatePanel: (id, patch) => {
    set((s) => ({ panels: s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    get().schedulePersist()
  },
  commit: () => get().persist(),

  deletePanel: (id) => {
    set((s) => ({ panels: s.panels.filter((p) => p.id !== id) }))
    get().persist()
  },

  // Move the panel at `from` so it sits at slot `to` in the resulting list.
  // `to` is an INSERTION index measured against the original list, which is what
  // a drop caret between two panels naturally gives you — removing the panel
  // first would shift every slot after it by one.
  movePanel: (from, to) => {
    set((s) => {
      if (from === to || from === to - 1) return {}
      const next = [...s.panels]
      const [moved] = next.splice(from, 1)
      next.splice(from < to ? to - 1 : to, 0, moved)
      return { panels: next }
    })
    get().persist()
  },

  clearBoard: () => {
    set({ panels: [] })
    get().persist()
  },
}))

// Drain any debounced panel edit whenever the session is flushed — most
// importantly on window close, which is the one flush the user can't retry.
registerFlushHook(() => useStoryboardStore.getState().flushPending())
