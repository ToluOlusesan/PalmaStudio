import { create } from 'zustand'
import { sessionIO, blankSession } from '../utils/sessionIO.js'
import { useCanvasStore } from './canvasStore.js'
import { checkMissing } from '../utils/pathUtils.js'
import { readSessionFile, saveSessionFile } from '../utils/platform.js'
import { snapToGrid } from '../utils/canvasUtils.js'
import { uid } from '../utils/id.js'

// Owns the full session JSON for the open project. Bridges the lightweight
// canvasStore and durable storage: hydrate on load, serialise on a 2s debounce
// after any change. Status drives the quiet "Saved" indicator in the topbar.
// Only the Dump Board is a generic-canvas module now; Focus owns its own state
// (zones / queue / placed items) in focusStore, persisted via saveModule('focus').
const CANVAS_MODULES = ['dumpboard']
let saveTimer = null

// Hydrate the live canvas store from a session's board for a given module.
function hydrateBoard(session, moduleKey) {
  if (!CANVAS_MODULES.includes(moduleKey)) return
  const board = session.modules?.[moduleKey] || {}
  // Object URLs don't survive reloads → flag file-backed items missing.
  const items = (board.items || []).map((it) => ({ ...it, missing: checkMissing(it) }))
  useCanvasStore.getState().hydrate({ ...board, items })
}

export const useSessionStore = create((set, get) => ({
  session: null,
  currentId: null,
  currentModule: null,
  status: 'saved', // 'saved' | 'saving' | 'dirty'

  loadSession: (id, moduleKey) => {
    // Fast path: localStorage cache (instant paint).
    let session = sessionIO.readSession(id)
    const hadCache = !!session
    if (!session) {
      session = blankSession(id, 'Untitled')
      sessionIO.writeSession(session)
    }
    session.lastOpened = new Date().toISOString()

    set({ session, currentId: id, currentModule: moduleKey, status: 'saved' })
    hydrateBoard(session, moduleKey)
    // Reference of exactly what we just hydrated onto the canvas. If anything
    // mutates the canvas (a drop, a move) the store hands back a new array, so
    // this reference is our "untouched" sentinel for the async reconcile below.
    const hydratedItems = useCanvasStore.getState().items

    // Disk reconcile: adopt the on-disk palma.json only when it is genuinely
    // newer than the cache (or there was no cache — fresh install / new
    // machine). The disk mirror is async fire-and-forget, so a fast quit can
    // leave palma.json a save behind; blindly adopting it used to clobber the
    // newer cache and "lose" freshly added images on reload. savedAt (stamped
    // by writeSession) is the arbiter.
    if (session.folder) {
      const cacheStamp = session.savedAt || ''
      readSessionFile(session.folder).then((disk) => {
        if (!disk || !disk.id) return
        const st = get()
        if (st.currentId !== id || st.status !== 'saved') return
        // The status check alone isn't enough: a drop followed by the 2s
        // autosave flush leaves status back at 'saved', and this stale read
        // (taken at open, before the drop) would then revert the board and lose
        // the just-added items. Bail if the live canvas no longer matches what
        // we hydrated.
        if (useCanvasStore.getState().items !== hydratedItems) return
        const diskStamp = disk.savedAt || ''
        if (hadCache && diskStamp <= cacheStamp) {
          // Disk is stale/equal — keep the cache, and re-mirror it so
          // palma.json catches up (covers the interrupted write at last quit).
          saveSessionFile(session.folder, get().session)
          return
        }
        disk.lastOpened = new Date().toISOString()
        sessionIO.cacheSession(disk) // refresh cache without writing back to disk
        set({ session: disk })
        hydrateBoard(disk, get().currentModule)
      })
    }
    return session
  },

  // Called when navigating between modules of the same project without unmount.
  switchModule: (moduleKey) => {
    const { session } = get()
    if (!session) return
    set({ currentModule: moduleKey })
    hydrateBoard(session, moduleKey)
  },

  // Persist a non-canvas module's data (scratchpad text, project skin…).
  saveModule: (moduleKey, data) => {
    const { session } = get()
    if (!session) return
    const next = {
      ...session,
      lastOpened: new Date().toISOString(),
      modules: { ...session.modules, [moduleKey]: data },
    }
    set({ session: next })
    get().scheduleSave()
  },

  // Mark dirty + debounce a flush. Canvas modules pull from canvasStore.
  scheduleSave: () => {
    set({ status: 'dirty' })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => get().flush(), 2000)
  },

  flush: () => {
    const { session, currentModule } = get()
    if (!session) return
    set({ status: 'saving' })

    let modules = session.modules
    if (CANVAS_MODULES.includes(currentModule)) {
      modules = {
        ...modules,
        [currentModule]: useCanvasStore.getState().snapshot(),
      }
    }
    const next = { ...session, lastOpened: new Date().toISOString(), modules }
    sessionIO.writeSession(next)
    set({ session: next, status: 'saved' })
  },

  // Ingest an item (a browser-extension clip, or a drag/paste that raced a
  // navigation — see landBoardItem in boardOps.js) into the OPEN project's Dump
  // Board, and FORCE an immediate synchronous disk write before returning —
  // deliberately not the normal 2s-debounced autosave. A dropped image is a
  // one-shot event with no natural "next edit" to catch it if the debounce
  // window is missed by some navigation pattern; better to pay one extra write
  // per drop than risk a silent loss. If the Dump Board is the visible module,
  // add it live to the canvas and return its new id — callers use that id for
  // any secondary polish (e.g. fitting an image's real aspect ratio once
  // decoded). Otherwise merge it into the session's dumpboard module in memory
  // before flushing — returning `true` (no live id to polish further). Returns
  // `null` if no project is open. A caller-provided `x`/`y` in `partial` wins
  // over the default stagger position (ClipReceiver never sets one; drag/paste
  // always does, to land at the drop point rather than the generic corner).
  ingestClip: (partial) => {
    const { session, currentModule } = get()
    if (!session) return null
    const stagger = (n) => ({
      x: partial.x ?? snapToGrid(40 + (n % 8) * 26),
      y: partial.y ?? snapToGrid(40 + (n % 8) * 26),
    })
    if (currentModule === 'dumpboard') {
      const n = useCanvasStore.getState().items.length
      const id = useCanvasStore.getState().addItem({ ...partial, ...stagger(n) })
      get().flush()
      return id
    }
    const db = session.modules?.dumpboard || { panX: 0, panY: 0, zoom: 1, items: [], maxZ: 0 }
    const n = db.items.length
    const maxZ = (db.maxZ || 0) + 1
    const item = {
      id: uid('item'),
      zIndex: maxZ,
      missing: false,
      ...partial,
      ...stagger(n),
    }
    set({
      session: {
        ...session,
        modules: { ...session.modules, dumpboard: { ...db, items: [...db.items, item], maxZ } },
      },
    })
    get().flush()
    return true
  },

  unload: () => {
    if (saveTimer) clearTimeout(saveTimer)
    set({ session: null, currentId: null, currentModule: null, status: 'saved' })
  },
}))
