import { create } from 'zustand'
import { sessionIO, blankSession } from '../utils/sessionIO.js'
import { uid } from '../utils/id.js'
import { getInboxDir, ensureProject, deletePath } from '../utils/platform.js'

// Dashboard-level store: the list of project summaries shown as cards plus
// which project is active. Summaries are the lightweight projection; the heavy
// canvas state lives in each session file (see sessionStore).
export const useProjectStore = create((set, get) => ({
  projects: sessionIO.listProjects(),
  activeProjectId: null,

  refresh: () => set({ projects: sessionIO.listProjects() }),

  createProject: (name = 'Untitled', folder = '') => {
    const id = uid('proj')
    const session = blankSession(id, name, folder)
    sessionIO.writeSession(session)

    const summary = {
      id,
      name,
      folder,
      created: session.created,
      lastOpened: session.lastOpened,
      thumbnail: null,
      palette: [],
      refCount: 0,
      sessionCount: 0,
    }
    const projects = [summary, ...get().projects]
    sessionIO.writeProjects(projects)
    set({ projects, activeProjectId: id })
    return id
  },

  // Find-or-create the dedicated Inbox project (browser-extension clips land
  // here). Folder is auto-provisioned under the app's userData on desktop.
  ensureInbox: async () => {
    const existing = get().projects.find((p) => p.inbox && !p.deleted)
    if (existing) return existing
    const folder = (await getInboxDir()) || ''
    if (folder) await ensureProject(folder)
    const id = uid('proj')
    const session = blankSession(id, 'Inbox', folder)
    sessionIO.writeSession(session)
    const summary = {
      id,
      name: 'Inbox',
      folder,
      created: session.created,
      lastOpened: session.lastOpened,
      thumbnail: null,
      palette: [],
      refCount: 0,
      sessionCount: 0,
      inbox: true,
    }
    const projects = [summary, ...get().projects]
    sessionIO.writeProjects(projects)
    set({ projects })
    return summary
  },

  openProject: (id) => {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, lastOpened: new Date().toISOString() } : p
    )
    sessionIO.writeProjects(projects)
    set({ projects, activeProjectId: id })
  },

  // Merge a partial summary (thumbnail, palette, counts) for one project.
  updateProject: (id, patch) => {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, ...patch } : p
    )
    sessionIO.writeProjects(projects)
    set({ projects })
  },

  renameProject: (id, name) => {
    get().updateProject(id, { name })
    const session = sessionIO.readSession(id)
    if (session) sessionIO.writeSession({ ...session, name })
  },

  // Soft delete — move a project to the Trash. Its card leaves the dashboard and
  // it drops out of the Library and Recents, but the session and every file on
  // disk are untouched, so it can be restored or purged later. Stamped with a
  // deletion time so the Trash view can show when it was removed.
  trashProject: (id) => {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, deleted: new Date().toISOString() } : p
    )
    sessionIO.writeProjects(projects)
    set({
      projects,
      activeProjectId: get().activeProjectId === id ? null : get().activeProjectId,
    })
  },

  // Bring a trashed project back onto the dashboard.
  restoreProject: (id) => {
    const projects = get().projects.map((p) => {
      if (p.id !== id) return p
      const { deleted, ...rest } = p
      return rest
    })
    sessionIO.writeProjects(projects)
    set({ projects })
  },

  // Permanently remove a project. Always drops the session + summary. Optionally
  // wipes files from disk: `wipeAssets` removes the project's assets/ folder (the
  // copied media the Library shows); `wipeFolder` removes the whole project
  // folder (assets AND any other files in it). Source files the user keeps
  // elsewhere on disk are never touched — only paths inside the project folder.
  purgeProject: async (id, { wipeAssets = false, wipeFolder = false } = {}) => {
    const proj = get().projects.find((p) => p.id === id)
    const folder = proj?.folder
    if (folder) {
      if (wipeFolder) await deletePath(folder)
      else if (wipeAssets) await deletePath(`${folder.replace(/[\\/]+$/, '')}/assets`)
    }
    const projects = get().projects.filter((p) => p.id !== id)
    sessionIO.writeProjects(projects)
    sessionIO.deleteSession(id)
    set({ projects })
  },

  // Bring sessions discovered on disk into the dashboard: cache each session and
  // upsert its summary (by id). Returns how many were newly added.
  importProjects: (sessions = []) => {
    let projects = [...get().projects]
    let added = 0
    for (const s of sessions) {
      if (!s || !s.id) continue
      sessionIO.cacheSession(s) // localStorage cache (no disk write-back)
      const images = (s.modules?.dumpboard?.items || []).filter((it) => it.type !== 'note')
      const summary = {
        id: s.id,
        name: s.name || 'Untitled',
        folder: s.folder || '',
        created: s.created || new Date().toISOString(),
        lastOpened: s.lastOpened || new Date().toISOString(),
        thumbnail: null,
        palette: s.modules?.projectskin?.palette || [],
        refCount: images.length,
        sessionCount: 0,
      }
      const idx = projects.findIndex((p) => p.id === s.id)
      if (idx === -1) {
        projects = [summary, ...projects]
        added += 1
      } else {
        projects[idx] = { ...projects[idx], ...summary }
      }
    }
    sessionIO.writeProjects(projects)
    set({ projects })
    return added
  },

  projectById: (id) => get().projects.find((p) => p.id === id) || null,
}))
