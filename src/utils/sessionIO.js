import { saveSessionFile } from './platform.js'

// Low-level persistence. localStorage is the fast working cache (web + desktop
// webview). Under Tauri, every session write is also mirrored to the project's
// own folder as palma.json (write-through), so projects live as real files on
// disk. We never store file contents, only state.

const K = {
  projects: 'oasis.projects',
  session: (id) => `oasis.session.${id}`,
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.warn('[oasis] persist failed', e)
    return false
  }
}

export const sessionIO = {
  // --- project index (dashboard cards) ---
  listProjects: () => read(K.projects, []),
  writeProjects: (projects) => write(K.projects, projects),

  // --- per-project session file ---
  readSession: (id) => read(K.session(id), null),
  writeSession: (session) => {
    // Stamp every write so readers can tell which copy is newest. The disk
    // mirror below is async fire-and-forget and can be cut off by a quick quit,
    // leaving palma.json older than the localStorage cache — loadSession's
    // reconcile compares savedAt so a stale disk file can never clobber newer
    // local data (the "images vanished after reload" bug).
    session.savedAt = new Date().toISOString()
    const ok = write(K.session(id_of(session)), session)
    // mirror to the project folder on disk (desktop only; fire-and-forget)
    if (session.folder) saveSessionFile(session.folder, session)
    return ok
  },
  // Update the localStorage cache only — no disk mirror. Used when reconciling
  // FROM disk so we don't immediately write the same bytes back.
  cacheSession: (session) => write(K.session(id_of(session)), session),
  deleteSession: (id) => localStorage.removeItem(K.session(id)),
}

function id_of(s) {
  return s.id
}

// A fresh, empty session in the canonical shape.
export function blankSession(id, name, folder = '') {
  const now = new Date().toISOString()
  return {
    id,
    name,
    folder, // per-project local folder (path label in web; real dir under Tauri)
    created: now,
    lastOpened: now,
    modules: {
      dumpboard: { panX: 0, panY: 0, zoom: 1, items: [], maxZ: 0 },
      moodboard: { panX: 0, panY: 0, zoom: 1, items: [], maxZ: 0 },
      motionref: { clips: [] },
      projectskin: { palette: [], pins: [], note: '' },
      scratchpad: { content: '' },
    },
  }
}
