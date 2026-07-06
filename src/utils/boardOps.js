import { sessionIO } from './sessionIO.js'
import { snapToGrid } from './canvasUtils.js'
import { uid } from './id.js'
import { useSessionStore } from '../store/sessionStore.js'

// Append a media item to a project's dump board session on disk/cache — used
// when that board is NOT the one currently open in the canvas store (clips into
// the Inbox, Move/Copy to another project). Assigns a fresh id/zIndex and a
// staggered position. Returns the new item id, or null if the session is gone.
export function appendBoardItem(projectId, partial) {
  const session = sessionIO.readSession(projectId)
  if (!session) return null
  const db = session.modules?.dumpboard || { panX: 0, panY: 0, zoom: 1, items: [], maxZ: 0 }
  const n = db.items.length
  const maxZ = (db.maxZ || 0) + 1
  const item = {
    id: uid('item'),
    zIndex: maxZ,
    x: snapToGrid(40 + (n % 8) * 26),
    y: snapToGrid(40 + (n % 8) * 26),
    missing: false,
    ...partial,
  }
  sessionIO.writeSession({
    ...session,
    modules: { ...session.modules, dumpboard: { ...db, items: [...db.items, item], maxZ } },
  })
  return item.id
}

// Land a freshly-created item in the project it was actually dropped/pasted
// into — `projectId`, captured at the START of the operation, before any
// `await`. A drag or paste that persists an image (writing bytes to disk,
// often over IPC) is async; if the user navigates to a different project (or
// the Dashboard) before it resolves, blindly calling the live canvasStore's
// addItem() would land the item on whatever board happens to be open now —
// or, worse, get silently discarded the moment that board's session is next
// written. ("The last one I drag always survives" was this race: everything
// still in flight when the user tabbed away lost the fight against the next
// hydrate/flush cycle.)
//
// If `projectId` is still the open project, ingest it there (live if the Dump
// Board is visible, in-memory + scheduled save otherwise — see
// sessionStore.ingestClip). Otherwise write it straight to that project's
// saved session, open or not, so it's never lost.
//
// Returns `{ liveId }` — a canvasStore item id when the item landed live (safe
// to pass to updateItem for secondary polish like fitting an image's real
// aspect ratio), or `null` when it was written durably but isn't live.
export function landBoardItem(projectId, partial) {
  const open = useSessionStore.getState().session
  if (projectId && open?.id === projectId) {
    const res = useSessionStore.getState().ingestClip(partial)
    return { liveId: typeof res === 'string' ? res : null }
  }
  if (projectId) appendBoardItem(projectId, partial)
  return { liveId: null }
}
